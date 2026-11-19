import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ACTIVE_CLASS = 'cosmic-active-window-border';
const MAXIMIZED_CLASS = 'cosmic-active-window-border-tiled';
const OVERVIEW_ACTIVE_CLASS = 'cosmic-overview-active-preview';

export default class CosmicWindowHighlightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._border = new St.Widget({
            style_class: ACTIVE_CLASS,
            reactive: false,
            can_focus: false,
            visible: false,
        });

        this._trackedWindow = null;
        this._windowSignals = [];
        this._overviewPreview = null;

        this._thicknessSignalId = this._settings.connect(
            'changed::border-thickness',
            () => this._applyThickness()
        );

        this._maximizedSignalId = this._settings.connect(
            'changed::highlight-maximized',
            () => this._syncVisibility()
        );

        this._animationDuration = this._settings.get_int('animation-duration');

        this._animationSignalId = this._settings.connect(
            'changed::animation-duration',
            () => {
                this._animationDuration = this._settings.get_int('animation-duration');
            }
        );

        this._focusSignalId = global.display.connect(
            'notify::focus-window',
            () => this._onFocusChanged()
        );

        this._overviewShowingId = Main.overview.connect(
            'showing',
            () => {
                this._syncVisibility();
                this._highlightOverviewFocus();
            }
        );

        this._overviewHiddenId = Main.overview.connect(
            'hidden',
            () => {
                this._clearOverviewHighlight();
                this._syncVisibility();
            }
        );

        this._applyThickness();
        this._onFocusChanged();
    }

    disable() {
        if (this._thicknessSignalId && this._settings) {
            this._settings.disconnect(this._thicknessSignalId);
            this._thicknessSignalId = 0;
        }

        if (this._maximizedSignalId) {
            this._settings.disconnect(this._maximizedSignalId);
            this._maximizedSignalId = null;
        }

        if (this._animationSignalId) {
            this._settings.disconnect(this._animationSignalId);
            this._animationSignalId = null;
        }

        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = 0;
        }

        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }

        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }

        this._detachWindow();
        this._clearOverviewHighlight();

        if (this._border) {
            this._border.destroy();
            this._border = null;
        }

        this._settings = null;
    }

    _getThickness() {
        return this._settings ? this._settings.get_int('border-thickness') : 3;
    }

    _applyThickness() {
        const px = this._getThickness();
        const radius = 12 + px;

        if (this._border) {
            this._border.set_style(
                `border-width: ${px}px; border-radius: ${radius}px;`
            );
            this._syncGeometry();
        }

        if (this._overviewPreview)
            this._overviewPreview.set_style(`border-width: ${px}px;`);
    }

    _onFocusChanged() {
        this._detachWindow();

        const win = global.display.focus_window;
        if (!win || !this._isHighlightable(win))
            return;

        const actor = win.get_compositor_private();
        if (!actor)
            return;

        this._trackedWindow = win;

        this._windowSignals = [
            win.connect('position-changed', () => this._syncGeometry()),
            win.connect('size-changed', () => this._syncGeometry()),
            win.connect('notify::fullscreen', () => this._syncVisibility()),
            win.connect('notify::maximized-horizontally', () => {
                this._syncVisibility();
                this._syncGeometry();
            }),
            win.connect('notify::maximized-vertically', () => {
                this._syncVisibility();
                this._syncGeometry();
            }),
            win.connect('unmanaging', () => this._detachWindow()),
        ];

        if (GObject.signal_lookup('notify::tile-mode', win)) {
            this._windowSignals.push(
                win.connect('notify::tile-mode', () => this._syncGeometry())
            );
        }

        actor.add_child(this._border);
        this._syncGeometry();
        this._syncVisibility();

        if (Main.overview.visible)
            this._highlightOverviewFocus();
    }

    _detachWindow() {
        if (this._trackedWindow) {
            for (const id of this._windowSignals)
                this._trackedWindow.disconnect(id);
            this._windowSignals = [];
            this._trackedWindow = null;
        }

        if (this._border) {
            this._border.remove_all_transitions();
            this._border.visible = false;

            const parent = this._border.get_parent();
            if (parent)
                parent.remove_child(this._border);
        }
    }

    _isHighlightable(win) {
        const type = win.get_window_type();
        return (
            type === Meta.WindowType.NORMAL ||
            type === Meta.WindowType.DIALOG ||
            type === Meta.WindowType.MODAL_DIALOG
        );
    }

    _fadeInBorder() {
        if (!this._border || !this._border.visible)
            return;

        const parent = this._border.get_parent();
        if (!parent)
            return;

        // If the WindowActor isn't mapped yet (newly created window),
        // wait until Mutter maps it onto the stage before easing.
        if (!parent.mapped) {
            if (this._mapSignalId) {
                parent.disconnect(this._mapSignalId);
                this._mapSignalId = null;
            }
            this._mapSignalId = parent.connect('notify::mapped', () => {
                if (parent.mapped) {
                    parent.disconnect(this._mapSignalId);
                    this._mapSignalId = null;
                    this._fadeInBorder();
                }
            });
            return;
        }

        this._border.remove_all_transitions();
        this._border.opacity = 0;
        this._border.ease({
            opacity: 255,
            duration: this._animationDuration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (this._border)
                    this._border.opacity = 255;
            },
        });
    }

    _syncVisibility() {
        if (!this._trackedWindow || !this._border)
            return;

        const inOverview =
            Main.overview.visible || Main.overview.visibleTarget;

        const hideMaximized =
            !inOverview &&
            this._trackedWindow.is_maximized() &&
            !this._settings.get_boolean('highlight-maximized');

        const shouldShow = !(
            this._trackedWindow.is_fullscreen() ||
            this._trackedWindow.minimized ||
            hideMaximized
        );

        if (this._border.visible === shouldShow)
            return;

        this._border.remove_all_transitions();

        if (!shouldShow) {
            this._border.visible = false;
            return;
        }

        this._border.visible = true;
        this._border.opacity = 0;
        this._fadeInBorder();
    }

    _isEdgeFlush(win) {
        // Full, vertical (Super+Shift+Up), or horizontal maximization / native half-tile
        if (win.is_maximized() || win.maximized_vertically || win.maximized_horizontally)
            return true;

        const frame = win.get_frame_rect();
        const workArea = Main.layoutManager.getWorkAreaForMonitor(win.get_monitor());
        const tol = 2; // Sub-pixel/fractional-scaling rounding tolerance

        // Edge alignment against work area (Math.abs ignores windows dragged off-screen)
        const onLeft = Math.abs(frame.x - workArea.x) <= tol;
        const onRight = Math.abs((frame.x + frame.width) - (workArea.x + workArea.width)) <= tol;
        const onTop = Math.abs(frame.y - workArea.y) <= tol;
        const onBottom = Math.abs((frame.y + frame.height) - (workArea.y + workArea.height)) <= tol;

        // Corner or quarter/side tile (requires perpendicular edges touching work area)
        return (onLeft || onRight) && (onTop || onBottom);
    }

    _syncGeometry() {
        if (!this._trackedWindow || !this._border)
            return;

        const buf = this._trackedWindow.get_buffer_rect();
        const frame = this._trackedWindow.get_frame_rect();
        const edgeFlush = this._isEdgeFlush(this._trackedWindow);

        const px = this._getThickness();
        const outset = edgeFlush ? 0 : px;

        const x = (frame.x - buf.x) - outset;
        const y = (frame.y - buf.y) - outset;

        this._border.set_position(x, y);
        this._border.set_size(
            frame.width + outset * 2,
            frame.height + outset * 2
        );

        if (edgeFlush) {
            this._border.add_style_class_name(MAXIMIZED_CLASS);
            this._border.set_style(`border-width: ${px}px; border-radius: 0px;`);
        } else {
            this._border.remove_style_class_name(MAXIMIZED_CLASS);
            this._border.set_style(`border-width: ${px}px; border-radius: ${12 + px}px;`);
        }
    }

    _highlightOverviewFocus() {
        this._clearOverviewHighlight();

        const focusWin = global.display.focus_window;
        if (!focusWin)
            return;

        const preview = this._findPreviewForWindow(Main.overview, focusWin);
        if (!preview)
            return;

        const px = this._getThickness();
        preview.add_style_class_name(OVERVIEW_ACTIVE_CLASS);
        preview.set_style(`outline-width: ${px}px;`);
        this._overviewPreview = preview;
    }

    _clearOverviewHighlight() {
        if (this._overviewPreview) {
            this._overviewPreview.remove_style_class_name(OVERVIEW_ACTIVE_CLASS);
            this._overviewPreview.set_style(null);
            this._overviewPreview = null;
        }
    }

    _findPreviewForWindow(root, targetWindow) {
        const stack = [root];
        while (stack.length > 0) {
            const actor = stack.pop();
            if (actor.metaWindow === targetWindow)
                return actor;

            for (const child of actor.get_children())
                stack.push(child);
        }
        return null;
    }
}
