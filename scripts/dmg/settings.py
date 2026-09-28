# The Sidq disk image's window, for dmgbuild. Used by build-dmg.sh, which
# builds a writable image with this layout and then has Finder set the
# background picture, because Finder on macOS 26 ignores a background that
# dmgbuild records itself.
#
# Positions are icon centres, in the same points as render-background.mjs.

app = defines["app"]  # noqa: F821, dmgbuild provides `defines`

format = defines.get("format", "UDZO")  # noqa: F821
files = [app]
symlinks = {"Applications": "/Applications"}

background = defines.get("background")  # noqa: F821
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
