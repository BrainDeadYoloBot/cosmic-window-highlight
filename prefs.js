import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CosmicWindowHighlightPreferences extends ExtensionPreferences {
    _getRange(settings, key) {
        const range = settings.settings_schema.get_key(key).get_range();
        const type = range.get_child_value(0).get_string()[0];
        if (type !== 'range')
            throw new Error(`GSettings key "${key}" does not have a range constraint`);

        const [min, max] = range.get_child_value(1).get_variant().deepUnpack();
        return { min, max };
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Customize the active window highlight ring',
        });
        page.add(group);

        const maximizedRow = new Adw.SwitchRow({
            title: 'Highlight Maximized Windows',
            subtitle: 'Show the active border around fully maximized windows',
        });
        settings.bind(
            'highlight-maximized',
            maximizedRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(maximizedRow);

        const thicknessRange = this._getRange(settings, 'border-thickness');
        const thicknessRow = new Adw.SpinRow({
            title: 'Border Thickness',
            subtitle: 'Width of the highlight border in pixels',
            adjustment: new Gtk.Adjustment({
                lower: thicknessRange.min,
                upper: thicknessRange.max,
                step_increment: 1,
                page_increment: 2,
                value: settings.get_int('border-thickness'),
            }),
        });
        group.add(thicknessRow);

        settings.bind(
            'border-thickness',
            thicknessRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const animationRange = this._getRange(settings, 'animation-duration');
        const animationRow = new Adw.SpinRow({
            title: ('Animation Duration (ms)'),
            subtitle: ('Fade-in duration when focusing or unmaximizing a window (0 to disable)'),
            adjustment: new Gtk.Adjustment({
                lower: animationRange.min,
                upper: animationRange.max,
                step_increment: 50,
                page_increment: 100,
                value: settings.get_int('animation-duration'),
            }),
        });
        settings.bind(
            'animation-duration',
            animationRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(animationRow);

        const radiusRange = this._getRange(settings, 'border-radius');
        const radiusRow = new Adw.SpinRow({
            title: ('Border radius'),
            subtitle: ('Roundness of the border corners'),
            adjustment: new Gtk.Adjustment({
                lower: radiusRange.min,
                upper: radiusRange.max,
                step_increment: 1,
                page_increment: 2,
                value: settings.get_int('border-radius'),
            }),
        });
        settings.bind(
            'border-radius',
            radiusRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(radiusRow);

        const dynamicOverviewRow = new Adw.SwitchRow({
            title: ('Dynamic border thickness in overview'),
            subtitle: ('Dynamically adjust border thickness in the overview based on the number of visible windows'),
        });
        settings.bind(
            'dynamic-overview',
            dynamicOverviewRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        group.add(dynamicOverviewRow);

        // Keep settings alive for the lifetime of the preferences window
        window._settings = settings;
    }
}