import UIKit
import WebKit
import Capacitor

/// Avoids a strong retain cycle between WKUserContentController and the bridge view controller.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

/// Edge-to-edge Capacitor bridge controller that syncs the iPhone status bar clock/battery contrast
/// (dark icons in Light Mode, white icons in Dark Mode) with TranoGasy's in-app theme class on <html>.
final class TranoGasyBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private static let themeHandlerName = "tgThemeSync"

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        statusBarStyle = .darkContent

        guard let userContentController = webView?.configuration.userContentController else {
            return
        }

        userContentController.removeScriptMessageHandler(forName: Self.themeHandlerName)
        userContentController.add(
            WeakScriptMessageHandler(delegate: self),
            name: Self.themeHandlerName
        )

        let scriptSource = """
        (function() {
          function notifyTheme() {
            try {
              var isDark = document.documentElement.classList.contains('dark');
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tgThemeSync) {
                window.webkit.messageHandlers.tgThemeSync.postMessage({ isDark: isDark });
              }
            } catch (e) {}
          }
          notifyTheme();
          if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(notifyTheme).observe(document.documentElement, {
              attributes: true,
              attributeFilter: ['class']
            });
          }
          window.addEventListener('pageshow', notifyTheme);
        })();
        """

        let userScript = WKUserScript(
            source: scriptSource,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        userContentController.addUserScript(userScript)
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == Self.themeHandlerName,
              let body = message.body as? [String: Any],
              let isDark = body["isDark"] as? Bool else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.statusBarStyle = isDark ? .lightContent : .darkContent
            self.setNeedsStatusBarAppearanceUpdate()
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = UIColor(red: 9.0 / 255.0, green: 9.0 / 255.0, blue: 11.0 / 255.0, alpha: 1.0)
        window?.rootViewController = TranoGasyBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
