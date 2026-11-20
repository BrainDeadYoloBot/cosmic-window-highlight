// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WindowPreview } from 'resource:///org/gnome/shell/ui/windowPreview.js';

const ACTIVE_CLASS = 'cosmic-active-window-border';
const MAXIMIZED_CLASS = 'cosmic-active-window-border-tiled';
const OVERVIEW_ACTIVE_CLASS = 'cosmic-overview-active-preview';

export default class CosmicWindowHighlightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._borderThickness = this._settings.get_int('border-thickness');
        this._highlightMaximized = this._settings.get_boolean('highlight-maximized');
        this._animationDuration = this._settings.get_int('animation-duration');
        this._borderRadius = this._settings.get_int('border-radius');

        this._border = new St.Widget({
            style_class: ACTIVE_CLASS,
            reactive: false,
            can_focus: false,
            visible: false,
        });

        this._trackedWindow = null;
        this._trackedActor = null;
        this._windowSignals = [];
        this._actorSignals = [];
        this._overviewPreview = null;
        this._overviewPreviewDestroyId = null;

        this._signals = [
            [this._settings, this._settings.connect('changed::border-thickness', () => {
                this._borderThickness = this._settings.get_int('border-thickness');
                this._applyBorder();
            })],
            [this._settings, this._settings.connect('changed::highlight-maximized', () => {
                this._highlightMaximized = this._settings.get_boolean('highlight-maximized');
                this._applyBorder();
            })],
            [this._settings, this._settings.connect('changed::animation-duration', () => {
                this._animationDuration = this._settings.get_int('animation-duration');
            })],
            [this._settings, this._settings.connect('changed::border-radius', () => {
                this._borderRadius = this._settings.get_int('border-radius');
                this._applyBorder();
            })],
            [global.display, global.display.connect('notify::focus-window', () => {
                this._onFocusChanged();
            })],
            [Main.overview, Main.overview.connect('showing', () => {
                this._applyBorder();
            })],
            [Main.overview, Main.overview.connect('hidden', () => {
                this._applyBorder();
            })],
        ];

        this._onFocusChanged();
    }

    disable() {
        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];

        this._detachWindow();
        this._clearOverviewPreview();

        if (this._border) {
            this._border.destroy();
            this._border = null;
        }

        this._settings = null;
    }

    _onFocusChanged() {
        this._detachWindow();

        const win = global.display.focus_window;
        if (!win || !this._isHighlightable(win)) {
            this._applyBorder();
            return;
        }

        const actor = win.get_compositor_private();
        if (!actor) {
            this._applyBorder();
            return;
        }

        this._trackedWindow = win;
        this._windowSignals = [
            win.connect('position-changed', () => this._applyBorder()),
            win.connect('size-changed', () => this._applyBorder()),
            win.connect('notify::fullscreen', () => this._applyBorder()),
            win.connect('notify::maximized-horizontally', () => this._applyBorder()),
            win.connect('notify::maximized-vertically', () => this._applyBorder()),
            win.connect('unmanaging', () => this._detachWindow()),
        ];

        this._trackedActor = actor;
        this._actorSignals = [
            actor.connect('notify::mapped', () => this._applyBorder()),
            actor.connect('destroy', () => {
                this._actorSignals = [];
                this._trackedActor = null;
                this._detachWindow();
            }),
        ];

        actor.add_child(this._border);
        this._applyBorder();
    }

    _detachWindow() {
        if (this._trackedWindow) {
            for (const id of this._windowSignals)
                this._trackedWindow.disconnect(id);
            this._windowSignals = [];
            this._trackedWindow = null;
        }

        if (this._trackedActor) {
            for (const id of this._actorSignals)
                this._trackedActor.disconnect(id);
            this._actorSignals = [];
            this._trackedActor = null;
        }

        if (this._border) {
            this._border.remove_all_transitions();
            this._border.visible = false;
            this._border.get_parent()?.remove_child(this._border);
        }
    }

    _clearOverviewPreview() {
        if (!this._overviewPreview)
            return;

        if (this._overviewPreviewDestroyId) {
            this._overviewPreview.disconnect(this._overviewPreviewDestroyId);
            this._overviewPreviewDestroyId = null;
        }

        this._overviewPreview.remove_style_class_name(OVERVIEW_ACTIVE_CLASS);
        this._overviewPreview.set_style(null);
        this._overviewPreview = null;
    }

    _isHighlightable(win) {
        const type = win.get_window_type();
        return (
            type === Meta.WindowType.NORMAL ||
            type === Meta.WindowType.DIALOG ||
            type === Meta.WindowType.MODAL_DIALOG
        );
    }

    _shouldShowBorder(win) {
        const hideMaximized =
            !Main.overview.visible &&
            win.is_maximized() &&
            !this._highlightMaximized;

        return !(win.is_fullscreen() || win.minimized || hideMaximized);
    }

    _isEdgeFlush(win) {
        if (win.is_maximized() || win.maximized_vertically || win.maximized_horizontally)
            return true;

        const frame = win.get_frame_rect();
        const workArea = Main.layoutManager.getWorkAreaForMonitor(win.get_monitor());
        const tol = 2;

        const onLeft = Math.abs(frame.x - workArea.x) <= tol;
        const onRight = Math.abs((frame.x + frame.width) - (workArea.x + workArea.width)) <= tol;
        const onTop = Math.abs(frame.y - workArea.y) <= tol;
        const onBottom = Math.abs((frame.y + frame.height) - (workArea.y + workArea.height)) <= tol;

        return (onLeft || onRight) && (onTop || onBottom);
    }

    _computeBorderGeometry(win) {
        const buf = win.get_buffer_rect();
        const frame = win.get_frame_rect();
        const edgeFlush = this._isEdgeFlush(win);
        const px = this._borderThickness;
        const rad = this._borderRadius;
        const outset = edgeFlush ? 0 : px;

        return {
            x: (frame.x - buf.x) - outset,
            y: (frame.y - buf.y) - outset,
            width: frame.width + outset * 2,
            height: frame.height + outset * 2,
            edgeFlush,
            radius: edgeFlush ? 0 : rad + px,
        };
    }

    _applyStyle(edgeFlush = false, radius = 0) {
        if (this._overviewPreview)
            this._overviewPreview.set_style(`outline-width: ${this._borderThickness}px;`);

        if (!this._border)
            return;

        if (edgeFlush)
            this._border.add_style_class_name(MAXIMIZED_CLASS);
        else
            this._border.remove_style_class_name(MAXIMIZED_CLASS);

        this._border.set_style(`border-width: ${this._borderThickness}px; border-radius: ${radius}px;`);
    }

    _applyBorder() {
        if (!this._border)
            return;

        if (Main.overview.visible) {
            const focusWin = global.display.focus_window;
            const preview = focusWin
                ? this._findPreviewForWindow(Main.layoutManager.overviewGroup, focusWin)
                : null;

            if (this._overviewPreview && this._overviewPreview !== preview)
                this._clearOverviewPreview();

            if (preview && this._overviewPreview !== preview) {
                preview.add_style_class_name(OVERVIEW_ACTIVE_CLASS);
                this._overviewPreview = preview;
                this._overviewPreviewDestroyId = preview.connect('destroy', () => {
                    this._overviewPreviewDestroyId = null;
                    this._overviewPreview = null;
                });
            }
        } else {
            this._clearOverviewPreview();
        }

        const parent = this._border.get_parent();
        if (!this._trackedWindow || !parent?.mapped || !this._shouldShowBorder(this._trackedWindow)) {
            this._border.remove_all_transitions();
            this._border.visible = false;
            if (this._overviewPreview)
                this._applyStyle();
            return;
        }

        const { x, y, width, height, edgeFlush, radius } = this._computeBorderGeometry(this._trackedWindow);
        this._border.set_position(x, y);
        this._border.set_size(width, height);
        this._applyStyle(edgeFlush, radius);

        if (!this._border.visible) {
            this._border.visible = true;
            if (this._animationDuration > 0)
                this._fadeInBorder();
            else
                this._border.opacity = 255;
        }
    }

    _fadeInBorder() {
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

    _findPreviewForWindow(root, targetWindow) {
        const stack = [root];
        while (stack.length > 0) {
            const actor = stack.pop();
            if (actor instanceof WindowPreview && actor.metaWindow === targetWindow)
                return actor;

            for (const child of actor.get_children())
                stack.push(child);
        }
        return null;
    }
}