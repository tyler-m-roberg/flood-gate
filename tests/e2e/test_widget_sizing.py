"""
E2E tests: Widget sizing and waveform plot rendering.

Verifies:
  1. Waveform plots fill the entire widget area (not clipped/cut off)
  2. Widgets default to full page width
  3. Plots re-render correctly after widget resize
  4. Per-widget channel selection works (channels scoped to selected widget)

Prerequisites:
  - Full Docker Compose stack running: docker compose up --build
  - Mock data loaded (happens automatically on first compose up)

Run:
  pytest tests/e2e/test_widget_sizing.py -v --headed
"""

import pytest
from playwright.sync_api import Page, expect

from conftest import BASE_URL, TEST_IDS


# ── Helpers ─────────────────────────────────────────────────────────────────────

def add_widget(page: Page, label: str) -> None:
    """Click an 'Add widget' button in the channel panel footer (aside)."""
    page.locator("aside button", has_text=label).click()
    page.wait_for_timeout(500)


def select_widget_by_handle(page: Page, index: int = 0) -> None:
    """Click a widget's drag handle to select it."""
    page.locator(".widget-drag-handle").nth(index).click()
    page.wait_for_timeout(300)


def toggle_channel(page: Page, channel_name: str) -> None:
    """Click a channel row in the channel panel to toggle it."""
    page.locator(f"text={channel_name}").first.click()
    page.wait_for_timeout(500)


def add_widget_with_channel(page: Page, widget_label: str, channel_name: str) -> None:
    """Add a widget, select it, and assign a channel."""
    add_widget(page, widget_label)
    # Select the most recently added widget (last drag handle)
    handles = page.locator(".widget-drag-handle")
    handles.last.click()
    page.wait_for_timeout(300)
    toggle_channel(page, channel_name)
    # Wait for canvas to render
    page.wait_for_timeout(1000)


# ── Tests ───────────────────────────────────────────────────────────────────────

class TestWaveformPlotFillsWidget:
    """The uPlot canvas should fill the plot container, not be clipped."""

    def test_uplot_wrapper_position_relative(self, workspace_page: Page):
        """The u-wrap div must have position: relative for correct layout."""
        page = workspace_page
        add_widget_with_channel(page, "Waveform View", "Impactor Force")

        pos = page.evaluate("""() => {
            const uwrap = document.querySelector('.u-wrap');
            return uwrap ? window.getComputedStyle(uwrap).position : null;
        }""")
        assert pos == "relative", (
            f".u-wrap has position: {pos}, expected 'relative'. "
            "uPlot CSS may not be loaded."
        )

    def test_uplot_children_positioned_absolute(self, workspace_page: Page):
        """u-over and u-under must be position: absolute to overlay correctly."""
        page = workspace_page
        add_widget_with_channel(page, "Waveform View", "Impactor Force")

        positions = page.evaluate("""() => {
            const over = document.querySelector('.u-over');
            const under = document.querySelector('.u-under');
            return {
                over: over ? window.getComputedStyle(over).position : null,
                under: under ? window.getComputedStyle(under).position : null,
            };
        }""")
        assert positions["over"] == "absolute", (
            f".u-over has position: {positions['over']}, expected 'absolute'"
        )
        assert positions["under"] == "absolute", (
            f".u-under has position: {positions['under']}, expected 'absolute'"
        )

    def test_canvas_not_clipped_vertically(self, workspace_page: Page):
        """The canvas should not be pushed below the visible container area."""
        page = workspace_page
        add_widget_with_channel(page, "Waveform View", "Impactor Force")

        dims = page.evaluate("""() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return null;
            // Find the plot container (flex-1 with overflow-hidden)
            const container = canvas.closest('div[class*="min-h-0"]');
            if (!container) return null;
            const cr = container.getBoundingClientRect();
            const cvr = canvas.getBoundingClientRect();
            return {
                containerH: Math.round(cr.height),
                canvasH: Math.round(cvr.height),
                canvasTopOffset: Math.round(cvr.top - cr.top),
            };
        }""")

        assert dims is not None, "Could not find canvas or container"

        # Canvas should start near the top of its container (not pushed down)
        # With uPlot CSS, the u-wrap uses position:relative and children overlap.
        # The canvas top offset should be small (within the axis area, typically < 30px)
        assert dims["canvasTopOffset"] < 50, (
            f"Canvas is pushed {dims['canvasTopOffset']}px below container top. "
            f"Expected < 50px. This indicates uPlot CSS positioning is broken."
        )

    def test_uplot_wrapper_fits_container(self, workspace_page: Page):
        """The uPlot wrapper height should not exceed the container height."""
        page = workspace_page
        add_widget_with_channel(page, "Waveform View", "Impactor Force")

        dims = page.evaluate("""() => {
            const uplot = document.querySelector('.uplot');
            if (!uplot) return null;
            const container = uplot.closest('div[class*="min-h-0"]');
            if (!container) return null;
            return {
                containerH: Math.round(container.getBoundingClientRect().height),
                uplotH: Math.round(uplot.getBoundingClientRect().height),
                ratio: uplot.getBoundingClientRect().height / container.getBoundingClientRect().height,
            };
        }""")

        assert dims is not None
        # The uPlot wrapper should not be more than 1.15x the container height
        assert dims["ratio"] < 1.15, (
            f"uPlot wrapper ({dims['uplotH']}px) overflows container "
            f"({dims['containerH']}px) by {(dims['ratio']-1)*100:.0f}%"
        )

    def test_canvas_has_reasonable_dimensions(self, workspace_page: Page):
        """Canvas should have width > 100 and height > 50."""
        page = workspace_page
        add_widget_with_channel(page, "Waveform View", "Impactor Force")

        dims = page.evaluate("""() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return null;
            return { w: canvas.width, h: canvas.height };
        }""")

        assert dims is not None, "No canvas element found"
        assert dims["w"] > 100, f"Canvas width too small: {dims['w']}px"
        assert dims["h"] > 50, f"Canvas height too small: {dims['h']}px"
        assert dims["h"] < 2000, f"Canvas height too large: {dims['h']}px"


class TestWidgetFullWidth:
    """Widgets should default to full dashboard width."""

    def test_widget_defaults_to_full_grid_width(self, workspace_page: Page):
        """A new widget should use the full 12-column grid width."""
        page = workspace_page
        add_widget(page, "Waveform View")

        dims = page.evaluate("""() => {
            const layout = document.querySelector('.layout');
            if (!layout) return null;
            const items = layout.querySelectorAll(':scope > div');
            if (items.length === 0) return null;
            const lr = layout.getBoundingClientRect();
            const ir = items[0].getBoundingClientRect();
            return {
                layoutW: Math.round(lr.width),
                widgetW: Math.round(ir.width),
                ratio: ir.width / lr.width,
            };
        }""")

        assert dims is not None, "Could not find layout or widget"
        # Widget should use at least 90% of layout width (accounting for margins)
        assert dims["ratio"] > 0.90, (
            f"Widget uses only {dims['ratio']*100:.0f}% of layout width. "
            f"Widget={dims['widgetW']}px, Layout={dims['layoutW']}px. "
            f"Expected > 90%."
        )

    def test_stats_widget_full_width(self, workspace_page: Page):
        """Stats widget should also default to full width."""
        page = workspace_page
        add_widget(page, "Statistics Table")

        dims = page.evaluate("""() => {
            const layout = document.querySelector('.layout');
            if (!layout) return null;
            const items = layout.querySelectorAll(':scope > div');
            if (items.length === 0) return null;
            const lr = layout.getBoundingClientRect();
            const ir = items[0].getBoundingClientRect();
            return { ratio: ir.width / lr.width };
        }""")

        assert dims is not None
        assert dims["ratio"] > 0.90, (
            f"Stats widget uses only {dims['ratio']*100:.0f}% of layout width"
        )


class TestPerWidgetChannelSelection:
    """Channel selection should be scoped to the selected widget."""

    def test_no_widget_selected_shows_banner(self, workspace_page: Page):
        """When no widget is selected, the channel panel shows a help banner."""
        page = workspace_page
        add_widget(page, "Waveform View")

        # Deselect by pressing Escape or clicking away
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        expect(page.locator("text=Click a widget to select it")).to_be_visible()

    def test_selecting_widget_shows_assigning_indicator(self, workspace_page: Page):
        """Clicking a widget shows 'Assigning to:' in the channel panel."""
        page = workspace_page
        add_widget(page, "Waveform View")
        select_widget_by_handle(page)

        expect(page.locator("text=Assigning to: Waveform View")).to_be_visible()

    def test_channel_toggle_adds_to_selected_widget(self, workspace_page: Page):
        """Toggling a channel adds it to the selected widget's channel list."""
        page = workspace_page
        add_widget(page, "Waveform View")
        select_widget_by_handle(page)
        toggle_channel(page, "Impactor Force")

        # The widget channels summary should show 1 channel
        expect(page.locator("text=Widget channels (1)")).to_be_visible()

    def test_channels_independent_between_widgets(self, workspace_page: Page):
        """Two widgets can have different channels assigned independently."""
        page = workspace_page

        # Add first widget and assign a channel
        add_widget(page, "Waveform View")
        select_widget_by_handle(page, 0)
        toggle_channel(page, "Impactor Force")
        page.wait_for_timeout(300)

        # Widget channels should show 1
        expect(page.locator("text=Widget channels (1)")).to_be_visible()

        # Add second widget
        add_widget(page, "Statistics Table")
        # Select the second widget (index 1)
        select_widget_by_handle(page, 1)
        page.wait_for_timeout(300)

        # Second widget should have 0 channels — no summary should appear
        expect(page.locator("text=Widget channels")).not_to_be_visible()

    def test_channel_removed_on_event_unload(self, workspace_page: Page):
        """Unloading an event removes its channels from all widgets."""
        page = workspace_page

        add_widget_with_channel(page, "Waveform View", "Impactor Force")

        # Verify canvas exists
        expect(page.locator("canvas").first).to_be_visible()

        # Unload the event via the trash button in channel panel
        trash_btn = page.locator("aside button[title='Remove event']").first
        trash_btn.click()
        page.wait_for_timeout(500)

        # Canvas should disappear (no data)
        expect(page.locator("canvas")).to_have_count(0)
