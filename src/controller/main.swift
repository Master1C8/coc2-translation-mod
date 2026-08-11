import Foundation

struct DebugTarget: Decodable {
    let type: String?
    let title: String?
    let url: String?
    let webSocketDebuggerUrl: String?
}

enum ControllerError: LocalizedError {
    case usage
    case scriptMissing(String)
    case noTarget
    case invalidResponse
    case protocolError(String)

    var errorDescription: String? {
        switch self {
        case .usage: return "Usage: CoC2TranslatorController <port> <translator.js>"
        case .scriptMissing(let path): return "Translator script not found: \(path)"
        case .noTarget: return "CoC2 page did not expose a debugging target in time"
        case .invalidResponse: return "Invalid response from Electron debugging endpoint"
        case .protocolError(let message): return "Electron rejected the translator: \(message)"
        }
    }
}

@main
struct CoC2TranslatorController {
    static func main() async {
        do {
            try await run()
        } catch {
            FileHandle.standardError.write(Data(("CoC2 Translator: \(error.localizedDescription)\n").utf8))
            exit(1)
        }
    }

    static func run() async throws {
        guard CommandLine.arguments.count == 3,
              let port = Int(CommandLine.arguments[1]),
              (1...65535).contains(port) else { throw ControllerError.usage }

        let scriptPath = CommandLine.arguments[2]
        guard FileManager.default.fileExists(atPath: scriptPath) else {
            throw ControllerError.scriptMissing(scriptPath)
        }
        let source = try String(contentsOfFile: scriptPath, encoding: .utf8)
            + "\n//# sourceURL=coc2-translator.bundle.js"

        let deadline = Date().addingTimeInterval(120)
        var lastConnectionError: Error?
        while Date() < deadline {
            if let targets = try? await fetchTargets(port: port) {
                let selected = targets.first(where: { target in
                    target.type == "page" && (
                        (target.url?.contains("/resources/app/index.html") ?? false)
                        || (target.url?.hasSuffix("/index.html") ?? false)
                        || (target.title?.localizedCaseInsensitiveContains("CoC2") ?? false)
                    )
                })
                if let socketString = selected?.webSocketDebuggerUrl,
                   let socketURL = URL(string: socketString) {
                    do {
                        try await inject(source: source, socketURL: socketURL)
                        print("CoC2 Translator injected")
                        return
                    } catch {
                        lastConnectionError = error
                    }
                }
            }
            try await Task.sleep(nanoseconds: 350_000_000)
        }

        if let lastConnectionError { throw lastConnectionError }
        throw ControllerError.noTarget
    }

    static func inject(source: String, socketURL: URL) async throws {
        let session = URLSession(configuration: .ephemeral)
        let socket = session.webSocketTask(with: socketURL)
        socket.resume()
        defer { socket.cancel(with: .normalClosure, reason: nil) }

        _ = try await sendCommand(socket, id: 1, method: "Page.enable", params: [:])
        _ = try await sendCommand(socket, id: 2, method: "Page.addScriptToEvaluateOnNewDocument", params: ["source": source])
        let response = try await sendCommand(socket, id: 3, method: "Runtime.evaluate", params: [
            "expression": source,
            "awaitPromise": true,
            "returnByValue": true
        ])
        if let result = response["result"] as? [String: Any],
           let inner = result["result"] as? [String: Any],
           let exception = inner["description"] as? String,
            inner["subtype"] as? String == "error" {
            throw ControllerError.protocolError(exception)
        }
    }

    static func fetchTargets(port: Int) async throws -> [DebugTarget] {
        guard let url = URL(string: "http://127.0.0.1:\(port)/json/list") else {
            throw ControllerError.invalidResponse
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw ControllerError.invalidResponse
        }
        return try JSONDecoder().decode([DebugTarget].self, from: data)
    }

    static func sendCommand(
        _ socket: URLSessionWebSocketTask,
        id: Int,
        method: String,
        params: [String: Any]
    ) async throws -> [String: Any] {
        let payload: [String: Any] = ["id": id, "method": method, "params": params]
        let data = try JSONSerialization.data(withJSONObject: payload)
        guard let text = String(data: data, encoding: .utf8) else { throw ControllerError.invalidResponse }
        try await socket.send(.string(text))

        while true {
            let message = try await socket.receive()
            let responseData: Data
            switch message {
            case .string(let value): responseData = Data(value.utf8)
            case .data(let value): responseData = value
            @unknown default: continue
            }
            guard let object = try JSONSerialization.jsonObject(with: responseData) as? [String: Any] else { continue }
            guard object["id"] as? Int == id else { continue }
            if let error = object["error"] as? [String: Any] {
                throw ControllerError.protocolError(error["message"] as? String ?? "unknown CDP error")
            }
            return object
        }
    }
}
