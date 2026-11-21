// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ACTIVE_CLASS = 'cosmic-active-window-border';

const HIGHLIGHTABLE_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
]);

export default class CosmicWindowHighlightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._borderThickness = this._settings.get_int('border-thickness');
        this._highlightMaximized = this._settings.get_boolean('highlight-maximized');
        this._animationDuration = this._settings.get_int('animation-duration');
        this._borderRadius = this._settings.get_int('border-radius');
        this._dynamicOverviewThickness = this._settings.get_boolean('dynamic-overview');
        this._maxOverviewBorderThickness = this._settings.settings_schema
            .get_key('border-thickness')
            .get_range()
            .get_child_value(1)
            .get_variant()
            .deepUnpack()[1];

        this._border = this._createBorder();
        this._trackedWindow = null;
        this._trackedActor = null;
        this._windowSignals = [];
        this._actorSignals = [];

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
            [this._settings, this._settings.connect('changed::dynamic-overview', () => {
                this._dynamicOverviewThickness = this._settings.get_boolean('dynamic-overview');
            })],
            [global.display, global.display.connect('notify::focus-window', () => {
                this._onFocusChanged();
            })],
            [Main.overview, Main.overview.connect('showing', () => {
                this._applyBorder();
            })],
            [Main.overview, Main.overview.connect('shown', () => {
                this._applyBorder();
            })],
            [Main.overview, Main.overview.connect('hidden', () => {
                this._onFocusChanged();
            })],
        ];

        this._onFocusChanged();
    }

    disable() {
        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];

        this._detachWindow();

        if (this._border) {
            this._border.destroy();
            this._border = null;
        }

        this._settings = null;
    }

    _createBorder() {
        const border = new St.Widget({
            style_class: ACTIVE_CLASS,
            reactive: false,
            can_focus: false,
            visible: false,
        });
        border.connect('destroy', () => {
            if (this._border === border)
                this._border = null;
        });
        return border;
    }

    _onFocusChanged() {
        const focusWin = global.display.focus_window;

        if (!focusWin && (Main.overview.visible || Main.overview.animationInProgress)) {
            this._applyBorder();
            return;
        }

        const win = focusWin && HIGHLIGHTABLE_TYPES.has(focusWin.get_window_type())
            ? focusWin
            : null;

        if (win === this._trackedWindow) {
            this._applyBorder();
            return;
        }

        this._detachWindow();

        if (!win)
            return;

        const actor = win.get_compositor_private();
        if (!actor)
            return;

        if (!this._border)
            this._border = this._createBorder();

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

    _shouldShowBorder(win, inOverview) {
        const hideFullscreen = !inOverview && win.is_fullscreen();
        const hideMaximized = !inOverview && win.is_maximized() && !this._highlightMaximized;
        return !(win.minimized || hideFullscreen || hideMaximized);
    }

    _isEdgeFlush(win) {
        if (win.is_fullscreen() || win.is_maximized() || win.maximized_vertically || win.maximized_horizontally)
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

    _getMonitorOverviewWindowCount(trackedWin) {
        return global.get_window_actors().filter(actor => {
            const win = actor.meta_window;
            return win &&
                win.get_monitor() === trackedWin.get_monitor() &&
                !win.is_skip_taskbar() &&
                HIGHLIGHTABLE_TYPES.has(win.get_window_type()) &&
                win.located_on_workspace(global.workspace_manager.get_active_workspace());
        }).length;
    }

    _getOverviewMultiplier(win) {
        if (!this._dynamicOverviewThickness)
            return 1;
        const count = this._getMonitorOverviewWindowCount(win);
        if (count <= 1)
            return 1.25;
        if (count <= 4)
            return 1.5;
        return 2;
    }

    _computeBorderGeometry(win, inOverview) {
        const buf = win.get_buffer_rect();
        const frame = win.get_frame_rect();
        const edgeFlush = this._isEdgeFlush(win);
        const px = inOverview
            ? Math.min(
                Math.round(this._borderThickness * this._getOverviewMultiplier(win)),
                this._maxOverviewBorderThickness + 3,
            )
            : this._borderThickness;
        const outset = edgeFlush ? 0 : px;

        return {
            x: (frame.x - buf.x) - outset,
            y: (frame.y - buf.y) - outset,
            width: frame.width + outset * 2,
            height: frame.height + outset * 2,
            thickness: px,
            radius: edgeFlush ? 0 : this._borderRadius + px,
        };
    }

    _applyBorder() {
        if (!this._border)
            return;

        const inOverview = Main.overview.visible;
        const parent = this._border.get_parent();
        const actorReady = inOverview || parent?.mapped;

        if (!this._trackedWindow || !actorReady || !this._shouldShowBorder(this._trackedWindow, inOverview)) {
            this._border.remove_all_transitions();
            this._border.visible = false;
            return;
        }

        const {
            x,
            y,
            width,
            height,
            thickness: px,
            radius
        } = this._computeBorderGeometry(this._trackedWindow, inOverview);
        this._border.set_position(x, y);
        this._border.set_size(width, height);
        this._border.set_style(`border-width: ${px}px; border-radius: ${radius}px;`);

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
}