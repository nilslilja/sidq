# The Sidq disk image, for dmgbuild.
#
#   .venv-dmg/bin/dmgbuild -s scripts/dmg/settings.py \
#     -D app=path/to/Sidq.app -D background=scripts/dmg/background.tiff \
#     "Sidq" out.dmg
#
# dmgbuild writes the window's layout (.DS_Store) itself rather than asking
# Finder to arrange a mounted image over AppleScript, so a release run never
# waits on a permission prompt or a Finder window that did not open in time.
#
# Positions are icon centres, in the same points as render-background.mjs.

app = defines["app"]  # noqa: F821, dmgbuild provides `defines`

format = "UDZO"
files = [app]
symlinks = {"Applications": "/Applications"}

background = defines["background"]  # noqa: F821
window_rect = ((240, 160), (560, 388))
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = "icon-view"

icon_size = 88
text_size = 13
icon_locations = {
    "Sidq.app": (150, 205),
    "Applications": (410, 205),
}
