import CONSTANTS from "../constants.js";
import {
    isPlacementVertical,
    isRealNumber,
    retrieveFirstImageFromJournalId,
    retrieveFirstTextFromJournalId,
} from "../lib/lib.js";
import { PinCushionPixiHelpers } from "../pixi/pin-cushion-pixi-helpers.js";
import { PinCushion } from "./PinCushion.js";

/**
 * @class PinCushionHUD
 *
 * A HUD extension that shows the Note preview
 */
export class PinCushionHUD extends BasePlaceableHUD {
    constructor(note, options) {
        super(note, options);
        this.data = note;
    }

    /**
     * Retrieve and override default options for this application
     */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "pin-cushion-hud",
            classes: [...super.defaultOptions.classes, "pin-cushion-hud"],
            // width: 400,
            // height: 200,
            minimizable: false,
            resizable: false,
            template: "modules/pin-cushion/templates/journal-preview.html",
        });
    }

    /**
     * Get data for template
     */
    async getData() {
        let data = super.getData();
        const note = this.object;

        const dataTmp = await PinCushionPixiHelpers._manageContentHtmlFromNote(note);
        data = foundry.utils.mergeObject(data, dataTmp);

        this.contentTooltip = await TextEditor.enrichHTML(`
          <div id="container" class="pin-cushion-hud-container" style="font-size:${data.fontSize}px; max-width:${data.maxWidth}px">
              ${data.contentTooltip}
          </div>`);
        this.fontSize = data.fontSize;
        this.maxWidth = data.maxWidth;

        return data;

        /*
        const entry = note.entry;
        let entryName = data.text;
        let entryIsOwner = true;
        let entryId = undefined;
        let entryIcon = data.texture?.src;
        let entryContent = data.text;
        if (entry) {
            entryName = entry.name;
            entryId = entry.id;
            entryIsOwner = entry.isOwner ?? true;
            entryIcon = retrieveFirstImageFromJournalId(entryId, note.page?.id, false);
            if (!entryIcon && data.icon) {
                entryIcon = data.icon;
            }
            entryContent = retrieveFirstTextFromJournalId(entryId, note.page?.id, false);
            if (!entryContent && data.text) {
                entryContent = data.text;
            }
        }
        // TODO The getFlag was returning as 'not a function', for whatever reason...
        // const showImage = note.getFlag(CONSTANTS.MODULE_ID, CONSTANTS.FLAGS.SHOW_IMAGE);
        const showImage = foundry.utils.getProperty(note.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.SHOW_IMAGE);
        const showImageExplicitSource = foundry.utils.getProperty(
            note.document.flags[CONSTANTS.MODULE_ID],
            CONSTANTS.FLAGS.SHOW_IMAGE_EXPLICIT_SOURCE,
        );
        const tooltipCustomDescription = foundry.utils.getProperty(
            note.document.flags[CONSTANTS.MODULE_ID],
            CONSTANTS.FLAGS.TOOLTIP_CUSTOM_DESCRIPTION,
        );

        let content;
        if (showImage) {
            const imgToShow = showImageExplicitSource ? showImageExplicitSource : entryIcon;
            if (imgToShow && imgToShow.length > 0) {
                content = await TextEditor.enrichHTML(`<img class='image' src='${imgToShow}' alt=''></img>`, {
                    secrets: entryIsOwner,
                    documents: true,
                    async: true,
                });
            } else {
                content = await TextEditor.enrichHTML(
                    `<img class='image' src='${CONSTANTS.PATH_TRANSPARENT}' alt=''></img>`,
                    {
                        secrets: entryIsOwner,
                        documents: true,
                        async: true,
                    },
                );
            }
        } else {
            if (!entry && tooltipCustomDescription) {
                const previewMaxLength = game.settings.get(CONSTANTS.MODULE_ID, "previewMaxLength");
                const textContent = tooltipCustomDescription;
                content =
                    textContent.length > previewMaxLength
                        ? `${textContent.substr(0, previewMaxLength)} ...`
                        : textContent;
            } else {
                const previewTypeAsText = foundry.utils.getProperty(
                    note.document.flags[CONSTANTS.MODULE_ID],
                    CONSTANTS.FLAGS.PREVIEW_AS_TEXT_SNIPPET,
                );
                let firstContent = entryContent ?? "";
                // START Support for 'Journal Anchor Links' JAL
                if (note.document.entryId) {
                    firstContent = firstContent.replaceAll(
                        "@UUID[.",
                        "@UUID[JournalEntry." + note.document.entryId + ".JournalEntryPage.",
                    );
                    firstContent = firstContent.replaceAll(`data-uuid=".`, `data-uuid="JournalEntry."`);
                }
                // END Support for 'Journal Anchor Links' JAL
                if (!previewTypeAsText) {
                    content = await TextEditor.enrichHTML(firstContent, {
                        secrets: entryIsOwner,
                        documents: true,
                        async: true,
                    });
                } else {
                    const previewMaxLength = game.settings.get(CONSTANTS.MODULE_ID, "previewMaxLength");
                    const textContent = $(firstContent).text();
                    content =
                        textContent.length > previewMaxLength
                            ? `${textContent.substr(0, previewMaxLength)} ...`
                            : textContent;
                }
            }
        }

        // START Support for 'Journal Anchor Links'
        if (note.document.entryId) {
            content = content.replaceAll(
                "@UUID[.",
                "@UUID[JournalEntry." + note.document.entryId + ".JournalEntryPage.",
            );
            // content = content.replaceAll(`data-uuid=".`, `data-uuid="JournalEntry."`);
        }
        // END Support for 'Journal Anchor Links'

        let titleTooltip = entryName; // by default is the title of the journal
        const newtextGM = foundry.utils.getProperty(note.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.PIN_GM_TEXT);
        if (game.user.isGM && game.settings.get(CONSTANTS.MODULE_ID, "noteGM") && newtextGM) {
            titleTooltip = newtextGM;
        } else if (data.text && data.text !== titleTooltip) {
            titleTooltip = data.text;
        }

        let bodyPlaceHolder = `<img class='image' src='${CONSTANTS.PATH_TRANSPARENT}' alt=''></img>`;

        data.tooltipId = note.id;
        data.title = titleTooltip;
        // data.body = content;
        data.body = bodyPlaceHolder;

        const fontSize = game.settings.get(CONSTANTS.MODULE_ID, "fontSize") || canvas.grid.size / 5;
        const maxWidth = game.settings.get(CONSTANTS.MODULE_ID, "maxWidth") || 400;

        data.titleTooltip = titleTooltip;
        data.content = content;
        data.fontSize = fontSize;
        data.maxWidth = maxWidth;

        const isTooltipShowTitleS = foundry.utils.getProperty(
            note.document.flags[CONSTANTS.MODULE_ID],
            CONSTANTS.FLAGS.TOOLTIP_SHOW_TITLE,
        );
        const isTooltipShowDescriptionS = foundry.utils.getProperty(
            note.document.flags[CONSTANTS.MODULE_ID],
            CONSTANTS.FLAGS.TOOLTIP_SHOW_DESCRIPTION,
        );

        const isTooltipShowTitle = String(isTooltipShowTitleS) === "true" ? true : false;
        const isTooltipShowDescription = String(isTooltipShowDescriptionS) === "true" ? true : false;

        this.contentTooltip = await TextEditor.enrichHTML(`
          <div id="container" class="pin-cushion-hud-container" style="font-size:${fontSize}px; max-width:${maxWidth}px">
              ${isTooltipShowTitle ? `<div id="header"><h3>${titleTooltip}</h3></div><hr/>` : ``}
              ${isTooltipShowDescription ? `<div id="content">${content} </div>` : ``}
          </div>

      `);
        return data;
      */
    }

    /**
     * Set app position
     */
    setPosition() {
        // {left, top, width, height, scale}={}){
        if (!this.object) {
            return;
        }
        const fontSize = this.fontSize;
        const maxWidth = this.maxWidth;

        const tooltipPlacement =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_PLACEMENT) ?? "e";

        const tooltipSmartPlacement =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_SMART_PLACEMENT) ??
            false;

        const tooltipFollowMouse =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_FOLLOW_MOUSE) ?? false;

        const isVertical = isPlacementVertical(tooltipPlacement);

        let orientation = "";
        if (tooltipPlacement.includes("e")) {
            orientation = "right";
        } else {
            orientation = "left";
        }

        // WITH TOOLTIP
        let x = 0;
        let y = 0;
        if (game.settings.get(CONSTANTS.MODULE_ID, "tooltipUseMousePositionForCoordinates")) {
            // const positionMouse = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.app.stage);
            const positionMouse = canvas.mousePosition;
            x = positionMouse.x;
            y = positionMouse.y;
        } else {
            x = this.object.center ? this.object.center.x : this.object.x;
            y = this.object.center ? this.object.center.y : this.object.y;
        }

        // if (isVertical) {
        //   x = x - this.object.size / 2;
        // }

        // const height = this.object.controlIcon.texture?.height
        //   ? this.object.controlIcon.texture?.height - this.object.tooltip.height
        //   : this.object.controlIcon.height - this.object.tooltip.height;

        /*
        const width = this.object.controlIcon.width * ratio_width;
        const height = this.object.controlIcon.height - this.object.tooltip.height;
        const left = x - (this.object.document?.iconSize / 2 || 0);
        const top = y - height / 2;
        */

        const width = this.object.controlIcon.width; //  * ratio_width;
        const height = this.object.controlIcon.height;
        let left = x - width / 2;

        // 2024-05-01 REMOVED
        /*
        const ratio = foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.RATIO_WIDTH) ?? 1;
        const ratio_width = isRealNumber(ratio) ? ratio : 1;
        const viewWidth = visualViewport.width;

        if (ratio_width != 1) {
            // left = x - (width / 2) * ratio_width; // correct shifting for the new scale.
            // left = (x + ratio_width * (this.object.document?.iconSize / 2) - (width * ratio_width * 4));
            left = x + ratio_width * (width / 2) - (width * ratio_width) / 2;
        }
        */

        const top = y - height / 2;

        const position = {
            height: height + "px",
            width: width + "px",
            left: left + "px",
            top: top + "px",
            "font-size": fontSize + "px",
            "max-width": maxWidth + "px",
        };
        this.element.css(position);
    }

    activateListeners(html) {
        super.activateListeners(html);

        // const elementToTooltip = html;
        let elementToTooltip = this.element;
        // let mouseOnDiv = html; // this.element; // this.element.parent()[0];
        if (!elementToTooltip.document) {
            elementToTooltip = $(elementToTooltip);
        }

        const fontSize = game.settings.get(CONSTANTS.MODULE_ID, "fontSize") || canvas.grid.size / 5;
        const maxWidth = game.settings.get(CONSTANTS.MODULE_ID, "maxWidth");

        const tooltipPlacement =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_PLACEMENT) ?? "e";

        const tooltipSmartPlacement =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_SMART_PLACEMENT) ??
            false;

        const tooltipFollowMouse =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_FOLLOW_MOUSE) ?? false;

        const tooltipColor =
            foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.TOOLTIP_COLOR) ?? "";

        let orientation = "";
        if (tooltipPlacement.includes("e")) {
            orientation = "right";
        } else {
            orientation = "left";
        }

        const isVertical = isPlacementVertical(tooltipPlacement);

        // WITH TOOLTIP
        let x = 0;
        let y = 0;
        if (game.settings.get(CONSTANTS.MODULE_ID, "tooltipUseMousePositionForCoordinates")) {
            // const positionMouse = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.app.stage);
            const positionMouse = canvas.mousePosition;
            x = positionMouse.x;
            y = positionMouse.y;
        } else {
            x = this.object.center ? this.object.center.x : this.object.x;
            y = this.object.center ? this.object.center.y : this.object.y;
        }

        // if (isVertical) {
        //   x = x - this.object.size / 2;
        // }

        // const height = this.object.controlIcon.texture?.height
        //   ? this.object.controlIcon.texture?.height - this.object.tooltip.height
        //   : this.object.controlIcon.height - this.object.tooltip.height;

        /*
        const width = this.object.controlIcon.width * ratio_width;
        const height = this.object.controlIcon.height - this.object.tooltip.height;
        const left = x - (this.object.document?.iconSize / 2 || 0); // orientation === "right" ? x - width : x + width;
        const top = y - height / 2;
        */

        const width = this.object.controlIcon.width; // * ratio_width;
        const height = this.object.controlIcon.height;
        let left = x - width / 2;

        // 2024-05-01 REMOVED
        /*
        const ratio = foundry.utils.getProperty(this.object.document.flags[CONSTANTS.MODULE_ID], CONSTANTS.FLAGS.RATIO_WIDTH) ?? 1;
        const ratio_width = isRealNumber(ratio) ? ratio : 1;
        const viewWidth = visualViewport.width;

        if (ratio_width != 1) {
            // left = x - (width / 2) * ratio_width; // correct shifting for the new scale.
            // left = (x + ratio_width * (this.object.document?.iconSize / 2) - (width * ratio_width * 4));
            left = x + ratio_width * (width / 2) - (width * ratio_width) / 2;
        }
        */

        const top = y - height / 2;

        // const orientation =
        //   (this.object.getGlobalPosition()?.x ?? 0) < viewWidth / 2 ? "right" : "left";
        // const top = y - height / 2;
        // const left = orientation === "right" ? x + width : x - width;

        /*
        const width = this.object.size * ratio; //this.object.width * ratio;
        const height = this.object.height - this.object.tooltip.height; // this.object.size;
        const left = x - this.object.size/2;  // - this.object.width/2 + offset,
        const top = y - this.object.size/2; // - this.object.height/2 + offset
        */

        const position = {
            height: height + "px",
            width: width + "px",
            left: left + "px",
            top: top + "px",
        };
        elementToTooltip.css(position);

        // $.powerTip.hide(html);

        // let popupId = tooltipColor ? 'powerTip-'+tooltipColor : 'powerTip';
        const tooltipPopupClass = tooltipColor
            ? "pin-cushion-hud-tooltip-" + tooltipColor
            : "pin-cushion-hud-tooltip-default";

        const tooltipTipContent = $(this.contentTooltip);

        elementToTooltip.data("powertipjq", tooltipTipContent);

        // if (tooltipFollowMouse) {
        //   elementToTooltip.powerTip({
        //     popupClass: tooltipPopupClass,
        //     followMouse: true,
        //   });
        // } else {
        elementToTooltip.powerTip({
            // 	(default: 'powerTip') HTML id attribute for the tooltip div.
            // popupId: popupId, // e.g. default 'powerTip'

            // (default: 'n') Placement location of the tooltip relative to the element it is open for.
            // Values can be n, e, s, w, nw, ne, sw, se, nw-alt, ne-alt, sw-alt,
            // or se-alt (as in north, east, south, and west).
            // This only matters if followMouse is set to false.
            placement: tooltipPlacement,

            // (default: false) When enabled the plugin will try to keep tips inside the browser viewport.
            // If a tooltip would extend outside of the viewport then its placement will be changed to an
            // orientation that would be entirely within the current viewport.
            // Only applies if followMouse is set to false.
            smartPlacement: tooltipSmartPlacement,

            // (default: false) Allow the mouse to hover on the tooltip.
            // This lets users interact with the content in the tooltip.
            // Only applies if followMouse is set to false and manual is set to false.
            mouseOnToPopup: true,

            // (default: false) If set to true the tooltip will follow the user’s mouse cursor.
            // Note that if a tooltip with followMouse enabled is opened by an event without
            // mouse data (like “focus” via keyboard navigation) then it will revert to static
            // placement with smart positioning enabled. So you may wish to set placement as well.
            followMouse: false,

            // (default: '') Space separated custom HTML classes for the tooltip div.
            // Since this plugs directly into jQuery’s addClass() method it will
            // also accept a function that returns a string.
            popupClass: tooltipPopupClass,

            // (default: 10) Pixel offset of the tooltip.
            // This will be the offset from the element the tooltip is open for, or
            // from the mouse cursor if followMouse is true.
            offset: 10,

            // (default: 100) Time in milliseconds to wait after mouse cursor leaves
            // the element before closing the tooltip. This serves two purposes: first,
            // it is the mechanism that lets the mouse cursor reach the tooltip
            // (cross the gap between the element and the tooltip div) for mouseOnToPopup tooltips.
            // And, second, it lets the cursor briefly leave the element and return without causing
            // the whole fade-out, intent test, and fade-in cycle to happen.
            closeDelay: 0,

            // (default: 100) Hover intent polling interval in milliseconds.
            intentPollInterval: 0,
        });
        // }
        $.powerTip.show(elementToTooltip);
    }

    // clear(){
    //   let mouseOnDiv = this.element; // this.element.parent()[0];
    //   if(!mouseOnDiv.data){
    //     mouseOnDiv = $(mouseOnDiv);
    //   }
    //   $.powerTip.hide(mouseOnDiv);
    // }
}
