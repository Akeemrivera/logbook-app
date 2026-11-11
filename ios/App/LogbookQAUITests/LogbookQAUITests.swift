import XCTest

/// Designed-for-iPad proof for the QA app only.
/// Screenshots are XCTest attachments with lifetime keepAlways, so they stay in the xcresult.
/// This runner never launches the production bundle and never selects a photo from the library.
final class LogbookQAUITests: XCTestCase {
    private let productionDisplay = "Borikèn Logbook"
    private let qaDisplay = "Borikèn Logbook QA"
    private let productionBundle = "com.borikengenetics.logbookapp"
    private let longName = "testplant x afghan landrace"
    private let motherName = "QA Landrace Mother"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func addShot(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func launchQA(shot name: String) -> XCUIApplication {
        let production = XCUIApplication(bundleIdentifier: productionBundle)
        XCTAssertNotEqual(production.state, .runningForeground, "Production Logbook is in the foreground. Stop.")
        let app = XCUIApplication()
        app.launch()
        XCTAssertNotEqual(app.label, productionDisplay, "The launched app uses the production display name.")
        if app.label != qaDisplay && app.label != "App" {
            addShot(app, "unexpected-label-\(app.label)")
        }
        addShot(app, name)
        XCTAssertNotEqual(production.state, .runningForeground, "Production Logbook came forward during launch.")
        return app
    }

    /// Dismiss the software keyboard the way a person would, so controls under it can become hittable.
    private func dismissKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.firstMatch.exists else { return }
        let done = [
            app.toolbars.buttons["Done"].firstMatch,
            app.keyboards.buttons["Done"].firstMatch,
            app.buttons["Done"].firstMatch,
            app.keyboards.buttons["Return"].firstMatch,
            app.keyboards.buttons["return"].firstMatch
        ]
        for button in done where button.exists && button.isHittable {
            button.tap()
            return
        }
        app.keyboards.firstMatch.swipeDown()
    }

    /// Swipe the web content up like a user, after dismissing the keyboard if it is showing.
    private func scrollLikeUser(_ app: XCUIApplication) {
        dismissKeyboard(app)
        let web = app.webViews.firstMatch
        if web.exists {
            web.swipeUp()
        } else {
            app.swipeUp()
        }
    }

    @discardableResult
    private func tap(_ app: XCUIApplication, _ label: String, timeout: TimeInterval = 6) -> Bool {
        let queries = [
            app.buttons[label].firstMatch,
            app.tabBars.buttons[label].firstMatch,
            app.staticTexts[label].firstMatch,
            app.webViews.buttons[label].firstMatch,
            app.webViews.staticTexts[label].firstMatch
        ]
        let end = Date().addingTimeInterval(timeout)
        var attemptedScroll = false
        while Date() < end {
            for element in queries where element.exists && element.isHittable {
                element.tap()
                return true
            }
            // Off-screen or covered by the keyboard: scroll/dismiss like a user, then require hittable.
            if attemptedScroll || queries.contains(where: { $0.exists }) {
                scrollLikeUser(app)
            }
            attemptedScroll = true
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return false
    }

    /// Tap a button whose accessibility label contains `text` (not static text).
    /// Needed when a row's label is a title plus a subtitle.
    @discardableResult
    private func tapButtonContaining(_ app: XCUIApplication, _ text: String, timeout: TimeInterval = 6) -> Bool {
        let pred = NSPredicate(format: "label CONTAINS %@", text)
        let queries = [
            app.webViews.buttons.matching(pred).firstMatch,
            app.buttons.matching(pred).firstMatch
        ]
        let end = Date().addingTimeInterval(timeout)
        var attemptedScroll = false
        while Date() < end {
            for element in queries where element.exists && element.isHittable {
                element.tap()
                return true
            }
            if attemptedScroll || queries.contains(where: { $0.exists }) {
                scrollLikeUser(app)
            }
            attemptedScroll = true
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return false
    }

    private func typeInField(_ app: XCUIApplication, placeholder: String, text: String) -> Bool {
        let named = app.webViews.textFields[placeholder].firstMatch
        let field = named.waitForExistence(timeout: 3) ? named : app.webViews.textFields.firstMatch
        guard field.waitForExistence(timeout: 4), field.isHittable else { return false }
        field.tap()
        field.typeText(text)
        dismissKeyboard(app)
        return true
    }

    func testLongComplianceNameStaysReadable() throws {
        let app = launchQA(shot: "01-launch")
        XCTAssertTrue(tap(app, "Add plant") || tap(app, "Plants"), "Add plant was not hittable.")
        if !app.webViews.textFields.firstMatch.exists {
            XCTAssertTrue(tap(app, "Add plant", timeout: 4), "The plant form did not open.")
        }
        addShot(app, "02-add-plant")
        XCTAssertTrue(typeInField(app, placeholder: "Blue Dream, basil, Sungold tomato", text: longName), "The strain field was not hittable.")
        XCTAssertTrue(tap(app, "Save plant"), "Save plant was not hittable.")
        addShot(app, "03-after-save")
        XCTAssertTrue(tap(app, "Compliance") || tap(app, "More"), "Compliance was not hittable.")
        _ = tap(app, "Compliance", timeout: 3)
        addShot(app, "04-compliance")
        let name = app.staticTexts[longName].firstMatch
        let button = app.buttons[longName].firstMatch
        let shown = name.waitForExistence(timeout: 6) ? name : button
        XCTAssertTrue(shown.exists, "The long plant name is not on the Compliance screen. The screenshot is the actual screen.")
        XCTAssertGreaterThan(shown.frame.width, 40, "The long tag name is squeezed to about one letter. Width \(shown.frame.width).")
        XCTAssertTrue(app.buttons["See all"].firstMatch.exists || app.staticTexts["Plant tags"].firstMatch.exists, "Plant tags and See all were not both reachable.")
        addShot(app, "05-long-tag")
    }

    func testPhotoControlCancelThenRelaunch() throws {
        let app = launchQA(shot: "10-launch")
        XCTAssertTrue(tap(app, "Breeding"), "Breeding was not hittable.")
        addShot(app, "11-breeding")
        // "+ Add mother" is on the Mothers & Fathers page, opened from the row at the bottom of Breeding.
        _ = tapButtonContaining(app, "Mothers & Fathers")
        let opened = tap(app, "+ Add mother") || tap(app, "Add mother or father") || tap(app, "+ Add")
        XCTAssertTrue(opened, "Add mother was not hittable.")
        XCTAssertTrue(typeInField(app, placeholder: "e.g., Strain name", text: motherName), "The mother name field was not hittable.")
        XCTAssertTrue(tap(app, "Save"), "Save was not hittable on the mother form.")
        addShot(app, "12-mother-saved")
        _ = tap(app, motherName, timeout: 4)
        addShot(app, "13-mother-profile")
        let photo = tap(app, "+ Add photo", timeout: 3) || tap(app, "Add photo", timeout: 2) || tap(app, "Photo", timeout: 2)
        addShot(app, "14-photo-control")
        cancelSystemPicker()
        addShot(app, "15-after-cancel")
        app.terminate()
        let again = launchQA(shot: "16-relaunch")
        _ = tap(again, "Breeding", timeout: 4)
        _ = tap(again, motherName, timeout: 4)
        addShot(again, "17-mother-after-relaunch")
        XCTAssertTrue(photo, "The photo control was not hittable, so no save was attempted.")
        let image = again.images.firstMatch
        if image.exists && image.frame.width > 20 {
            return
        }
        XCTFail("No synthetic image was stored. The system picker was cancelled so a personal library photo was not chosen. Persistence is not proven. The xcresult screenshots are the actual screens.")
    }

    private func cancelSystemPicker() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let labels = ["Cancel", "Don’t Allow", "Don't Allow", "Not Now"]
        for label in labels {
            let button = springboard.buttons[label].firstMatch
            if button.waitForExistence(timeout: 1), button.isHittable {
                button.tap()
                return
            }
        }
    }
}
