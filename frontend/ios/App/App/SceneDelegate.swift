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

/// Capacitor bridge subclass that observes the web app's Light/Dark class on <html>
/// so the native iOS status bar strip and clock/icon contrast always match TranoGasy's theme.
final class TranoGasyBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    var onThemeChanged: ((Bool) -> Void)?

    private static let themeHandlerName = "tgThemeSync"

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
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
            self?.onThemeChanged?(isDark)
        }
    }
}

/// Native iOS container that pins the Capacitor WebView below the top status bar / Dynamic Island
/// without modifying Web or Android layouts.
final class SafeAreaHostViewController: UIViewController {
    private let bridgeVC = TranoGasyBridgeViewController()
    private var isDarkTheme = false

    private static let lightBackground = UIColor.white
    private static let darkBackground = UIColor(
        red: 9.0 / 255.0,
        green: 9.0 / 255.0,
        blue: 11.0 / 255.0,
        alpha: 1.0
    )

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return isDarkTheme ? .lightContent : .darkContent
    }

    override var childForStatusBarHidden: UIViewController? {
        return bridgeVC
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return bridgeVC.supportedInterfaceOrientations
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.lightBackground

        bridgeVC.onThemeChanged = { [weak self] isDark in
            self?.applyTheme(isDark: isDark)
        }

        addChild(bridgeVC)
        bridgeVC.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridgeVC.view)

        NSLayoutConstraint.activate([
            bridgeVC.view.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            bridgeVC.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridgeVC.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bridgeVC.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        bridgeVC.didMove(toParent: self)
    }

    private func applyTheme(isDark: Bool) {
        guard isDarkTheme != isDark else { return }
        isDarkTheme = isDark
        UIView.animate(withDuration: 0.2) {
            self.view.backgroundColor = isDark ? Self.darkBackground : Self.lightBackground
        }
        setNeedsStatusBarAppearanceUpdate()
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
        window?.backgroundColor = .white
        window?.rootViewController = SafeAreaHostViewController()
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
