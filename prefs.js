import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CosmicWindowHighlightPreferences extends ExtensionPreferences {
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

        const thicknessRow = new Adw.SpinRow({
            title: 'Border Thickness',
            subtitle: 'Width of the highlight border in pixels (default: 3)',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 12,
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

        const animationRow = new Adw.SpinRow({
            title: ('Animation Duration (ms)'),
            subtitle: ('Fade-in duration when focusing or unmaximizing a window (0 to disable)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 5000,
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

        // Keep settings alive for the lifetime of the preferences window
        window._settings = settings;
    }
}
