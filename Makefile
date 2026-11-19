UUID = cosmic-window-highlight@braindeadyolobot
ZIP_FILE = $(UUID).shell-extension.zip
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: schemas pack install uninstall prefs test clean

schemas:
	glib-compile-schemas schemas/

pack: schemas
	gnome-extensions pack --force \
		--extra-source=prefs.js \
		--extra-source=stylesheet.css \
		--schema=schemas/org.gnome.shell.extensions.cosmic-window-highlight.gschema.xml

install: pack
	gnome-extensions install --force $(ZIP_FILE)
	@echo "Installed. Log out/in (Wayland) or run: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID) || rm -rf $(INSTALL_DIR)

prefs:
	gnome-extensions prefs $(UUID)

test: pack
	gnome-shell-test-tool --extension $(ZIP_FILE)

clean:
	rm -f $(ZIP_FILE) schemas/gschemas.compiled
