import PinCushionAboutApp from './module/about.js';

/**
 * A class for managing additional Map Pin functionality
 * @author Evan Clarke (errational#2007)
 */
class PinCushion {
  constructor() {
    // Storage for requests sent over a socket, pending GM execution
    this._requests = {};
  }

  /* -------------------------------- Constants ------------------------------- */

  static get MODULE_NAME() {
    return 'pin-cushion';
  }

  static get MODULE_TITLE() {
    return 'Pin Cushion';
  }

  static get PATH() {
    return 'modules/pin-cushion';
  }

  static get DIALOG() {
    const defaultPermission = game.settings.get(PinCushion.MODULE_NAME, 'defaultJournalPermission');
    const defaultFolder = game.settings.get(PinCushion.MODULE_NAME, 'defaultJournalFolder');
    const folders = game.journal.directory.folders
      .filter((folder) => folder.displayed)
      .map((folder) => `<option value="${folder.id}">${folder.name}</option>`)
      .join('\n');
    return {
      content: `
              <div class="form-group">
                <p class="notes">${game.i18n.localize('PinCushion.Name')}</p>
                </label>
                <input name="name" type="text">
                <p class="notes">${game.i18n.localize('PinCushion.DefaultPermission')}</p>
                </label>
                <select id="cushion-permission" style="width: 100%;">
                  <option value="0" ${defaultPermission == '0' ? 'selected' : ''}>${game.i18n.localize(
        'PERMISSION.NONE',
      )}</option>
                  <option value="1" ${defaultPermission == '1' ? 'selected' : ''}>${game.i18n.localize(
        'PERMISSION.LIMITED',
      )}</option>
                  <option value="2" ${defaultPermission == '2' ? 'selected' : ''}>${game.i18n.localize(
        'PERMISSION.OBSERVER',
      )}</option>
                  <option value="3" ${defaultPermission == '3' ? 'selected' : ''}>${game.i18n.localize(
        'PERMISSION.OWNER',
      )}</option>
                </select>
                <p class="notes">${game.i18n.localize('PinCushion.Folder')}</p>
                </label>
                <select id="cushion-folder" style="width: 100%;">
                  <option value="none" ${defaultFolder == 'none' ? 'selected' : ''}>${game.i18n.localize(
        'PinCushion.None',
      )}</option>
                  ${
                    game.user.isGM
                      ? ``
                      : `<option value="perUser" ${defaultFolder == 'perUser' ? 'selected' : ''}>${game.i18n.localize(
                          'PinCushion.PerUser',
                        )}</option>`
                  }
                  <option disabled>──${game.i18n.localize('PinCushion.ExistingFolders')}──</option>
                  ${folders}
                </select>
              </div>
              </br>
              `,
      title: 'Create a Map Pin',
    };
  }

  static get NOTESLAYER() {
    return 'NotesLayer';
  }

  static get FONT_SIZE() {
    return 16;
  }

  /* --------------------------------- Methods -------------------------------- */

  /**
   * Creates and renders a dialog for name entry
   * @param {*} data
   * @todo break callbacks out into separate methods
   */
  _createDialog(data) {
    new Dialog({
      title: PinCushion.DIALOG.title,
      content: PinCushion.DIALOG.content,
      buttons: {
        save: {
          label: 'Save',
          icon: `<i class="fas fa-check"></i>`,
          callback: (html) => {
            return this.createNoteFromCanvas(html, data);
          },
        },
        cancel: {
          label: 'Cancel',
          icon: `<i class="fas fa-times"></i>`,
          callback: (e) => {
            // Maybe do something in the future
          },
        },
      },
      default: 'save',
    }).render(true);
  }

  /**
   * Creates a Note from the Pin Cushion dialog
   * @param {*} html
   * @param {*} data
   */
  async createNoteFromCanvas(html, eventData) {
    const input = html.find("input[name='name']");

    if (!input[0].value) {
      ui.notifications.warn(game.i18n.localize('PinCushion.Warn.MissingPinName'));
      return;
    }
    // Permissions the Journal Entry will be created with
    const permission = {
      [game.userId]: CONST.ENTITY_PERMISSIONS.OWNER,
      default: parseInt($('#cushion-permission').val()),
    };

    // Get folder ID for Journal Entry
    let folder;
    const selectedFolder = $('#cushion-folder').val();
    if (selectedFolder === 'none') folder = undefined;
    else if (selectedFolder === 'perUser') {
      folder = PinCushion.getFolder(game.user.name, selectedFolder);
      if (!game.user.isGM && folder === undefined) {
        // Request folder creation when perUser is set and the entry is created by a user
        // Since only the ID is required, instantiating a Folder from the data is not necessary
        folder = (await PinCushion.requestEvent({ action: 'createFolder' }))?._id;
      }
    } else folder = selectedFolder; // Folder is already given as ID

    const entry = await JournalEntry.create({ name: `${input[0].value}`, permission, ...(folder && { folder }) });

    if (!entry) {
      return;
    }

    // Manually add fields required by Foundry's drop handling
    const entryData = entry.data.toJSON();
    entryData.id = entry.id;
    entryData.type = 'JournalEntry';

    if (canvas.activeLayer.name !== PinCushion.NOTESLAYER) {
      await canvas.notes.activate();
    }

    await canvas.activeLayer._onDropData(eventData, entryData);
  }

  /**
   * Request an action to be executed with GM privileges.
   *
   * @static
   * @param {object} message - The object that will get emitted via socket
   * @param {string} message.action - The specific action to execute
   * @returns {Promise} The promise of the action which will be resolved after execution by the GM
   */
  static requestEvent(message) {
    // A request has to define what action should be executed by the GM
    if (!'action' in message) return;

    const promise = new Promise((resolve, reject) => {
      const id = `${game.user.id}_${Date.now()}_${randomID()}`;
      message.id = id;
      game.pinCushion._requests[id] = { resolve, reject };
      game.socket.emit(`module.${PinCushion.MODULE_NAME}`, message);
      setTimeout(() => {
        delete game.pinCushion._requests[id];
        reject(new Error(`${PinCushion.MODULE_TITLE} | Call to ${message.action} timed out`));
      }, 5000);
    });
    return promise;
  }

  /**
   * Gets the JournalEntry Folder ID to be used for JournalEntry creations, if any.
   *
   * @static
   * @param {string} name - The player name to check folders against, defaults to current user's name
   * @returns {string|undefined} The folder's ID, or undefined if there is no target folder
   */
  static getFolder(name, setting) {
    name = name ?? game.user.name;
    switch (setting) {
      // No target folder set
      case 'none':
        return undefined;
      // Target folder should match the user's name
      case 'perUser':
        return game.journal.directory.folders.find((f) => f.name === name)?.id ?? undefined;
      default:
        return name;
    }
  }

  /**
   * Checks for missing Journal Entry folders and creates them
   *
   * @static
   * @private
   * @returns {void}
   */
  static async _createFolders() {
    // Collect missing folders
    const setting = game.settings.get(PinCushion.MODULE_NAME, 'defaultJournalFolder');
    const missingFolders = game.users
      .filter((u) => !u.isGM && PinCushion.getFolder(u.name, setting) === undefined)
      .map((user) => ({
        name: user.name,
        type: 'JournalEntry',
        parent: null,
        sorting: 'a',
      }));
    if (missingFolders.length) {
      // Ask for folder creation confirmation in a dialog
      const createFolders = await new Promise((resolve, reject) => {
        new Dialog({
          title: game.i18n.localize('PinCushion.CreateMissingFoldersT'),
          content: game.i18n.localize('PinCushion.CreateMissingFoldersC'),
          buttons: {
            yes: {
              label: `<i class="fas fa-check"></i> ${game.i18n.localize('Yes')}`,
              callback: () => resolve(true),
            },
            no: {
              label: `<i class="fas fa-times"></i> ${game.i18n.localize('No')}`,
              callback: () => reject(),
            },
          },
          default: 'yes',
          close: () => reject(),
        }).render(true);
      }).catch((_) => {});
      // Create folders
      if (createFolders) await Folder.create(missingFolders);
    }
  }

  /**
   * Replaces icon selector in Notes Config form with filepicker
   * @param {*} app
   * @param {*} html
   * @param {*} data
   */
  static _replaceIconSelector(app, html, data) {
    const filePickerHtml = `<input type="text" name="icon" title="Icon Path" class="icon-path" value="${data.data.icon}" placeholder="/icons/example.svg" data-dtype="String">
        <button type="button" name="file-picker" class="file-picker" data-type="image" data-target="icon" title="Browse Files" tabindex="-1">
        <i class="fas fa-file-import fa-fw"></i>
        </button>`;

    const iconSelector = html.find("select[name='icon']");

    iconSelector.replaceWith(filePickerHtml);

    // Detect and activate file-picker buttons
    //html.find('button.file-picker').on('click', app._activateFilePicker.bind(app));
    html.find('button.file-picker').each((i, button) => (button.onclick = app._activateFilePicker.bind(app)));
  }

  /**
   * Add background field
   * @param {*} app
   * @param {*} html
   * @param {*} data
   */
  static _addBackgroundField(app, html, data) {
    const hasBackground = app.object.getFlag(PinCushion.MODULE_NAME, 'hasBackground') ?? false;
    const iconTintGroup = html.find('[name=iconTint]').closest('.form-group');
    iconTintGroup.after(`
            <div class="form-group">
                <label for="flags.pin-cushion.hasBackground">${game.i18n.localize('PinCushion.HasBackground')}</label>
                <input type="checkbox" name="flags.pin-cushion.hasBackground" data-dtype="Boolean" ${
                  hasBackground ? 'checked' : ''
                }>
            </div>
        `);
    app.setPosition({ height: 'auto' });
  }

  /**
   * Replaces icon selector in Notes Config form with filepicker and adds fields to set player-only note icons.
   * @param {*} app
   * @param {*} html
   * @param {*} data
   */
  static _addPlayerIconField(app, html, data) {
    /* Adds fields to set player-only note icons */
    /* Get default values set by GM */
    const defaultState = game.settings.get(PinCushion.MODULE_NAME, 'playerIconAutoOverride');
    const defaultPath = game.settings.get(PinCushion.MODULE_NAME, 'playerIconPathDefault');

    const state = getProperty(data, `data.flags.${PinCushion.MODULE_NAME}.PlayerIconState`) ?? defaultState;
    const path = getProperty(data, `data.flags.${PinCushion.MODULE_NAME}.PlayerIconPath`) ?? defaultPath;

    /* Set HTML to be added to the note-config */
    const playerIconHtml = `<hr>
        <!-- Button to Enable overrides -->
        <div class="form-group">
        <label>${game.i18n.localize('PinCushion.UsePlayerIcon')}</label>
        <div class="form-fields">
        <input type="checkbox" name="flags.${PinCushion.MODULE_NAME}.PlayerIconState" data-dtype="Boolean" ${
      state ? 'checked' : ``
    } />
        </div>
        <p class="notes">${game.i18n.localize('PinCushion.PlayerIconHint')}</p>
        </div>

        <!-- Player Icon -->
        <div class="form-group">
        <label>${game.i18n.localize('PinCushion.PlayerIconPath')}</label>
        <!--
        <div class="form-fields">
        <select name="icon">
        </select>
        -->
        <input type="text" name="flags.${
          PinCushion.MODULE_NAME
        }.PlayerIconPath" title="Icon Path" class="icon-path" value='${path ? path : ``}'
        data-dtype="String">

        <button type="button" name="file-picker" class="file-picker" data-type="image" data-target="flags.${
          PinCushion.MODULE_NAME
        }.PlayerIconPath"
        title="Browse Files" tabindex="-1">
        <i class="fas fa-file-import fa-fw"></i>
        </button>
        </div>`;

    // Insert Player Icon handling at end of config
    html.find('button[name="submit"]').before(playerIconHtml);
  }

  /* -------------------------------- Listeners ------------------------------- */

  /**
   * Handles doubleclicks
   * @param {*} event
   */
  static _onDoubleClick(event) {
    if (canvas.activeLayer._hover) {
      return;
    }

    // Silently return when note creation permissions are missing
    if (!game.user.can('NOTE_CREATE')) return;

    // Warn user when notes can be created, but journal entries cannot
    if (!game.user.can('JOURNAL_CREATE')) {
      ui.notifications.warn(
        game.i18n.format('PinCushion.Warn.AllowPlayerNotes', {
          permission: game.i18n.localize('PERMISSION.JournalCreate'),
        }),
      );
      return;
    }

    const data = {
      clientX: event.data.global.x,
      clientY: event.data.global.y,
    };

    game.pinCushion._createDialog(data);
  }

  /**
   * Handles draw control icon
   * @param {*} event
   */
  static _drawControlIcon(event) {
    let tint = this.data.iconTint ? colorStringToHex(this.data.iconTint) : null;
    let iconData = { texture: this.data.icon, size: this.size, tint: tint };
    let icon;
    if (this.getFlag(PinCushion.MODULE_NAME, 'hasBackground')) {
      icon = new ControlIcon(iconData);
    } else {
      icon = new BackgroundlessControlIcon(iconData);
    }
    if (this.data?.flags?.autoIconFlags) {
      const flagsAutomaticJournalIconNumbers = {
          autoIcon: this.data?.flags.autoIconFlags.autoIcon,
          iconType: this.data?.flags.autoIconFlags.iconType,
          iconText: this.data?.flags.autoIconFlags.iconText,
          foreColor: this.data?.flags.autoIconFlags.foreColor,
          backColor: this.data?.flags.autoIconFlags.backColor,
          fontFamily: this.data?.flags.autoIconFlags.fontFamily
      }
      if(flagsAutomaticJournalIconNumbers.fontFamily){
        this.data.fontFamily = flagsAutomaticJournalIconNumbers.fontFamily;
      }
      //this.controlIcon?.bg?.fill = flagsAutomaticJournalIconNumbers.backColor;
    }
    icon.x -= this.size / 2;
    icon.y -= this.size / 2;
    return icon;
  }

  /**
   * Defines the icon to be drawn for players if enabled.
   */
  static _onPrepareNoteData(wrapped) {
    wrapped();

    // IF not GM and IF  = enabled then take flag path as note.data.icon
    if (!game.user.isGM && this.data.flags[PinCushion.MODULE_NAME]?.PlayerIconState) {
      this.data.icon = this.data.flags[PinCushion.MODULE_NAME]?.PlayerIconPath;
    }
  }

  /**
   * Socket handler
   *
   * @param {object} message - The socket event's content
   * @param {string} message.action - The action the socket receiver should take
   * @param {Data} [message.data] - The data to be used for Document actions
   * @param {string} [message.id] - The ID used to handle promises
   * @param {string} userId - The ID of the user emitting the socket event
   * @returns {void}
   */
  _onSocket(message, userId) {
    const { action, data, id } = message;
    const isFirstGM = game.user === game.users.find((u) => u.isGM && u.active);

    // Handle resolving or rejecting promises for GM priviliged requests
    if (action === 'return') {
      const promise = game.pinCushion._requests[message.id];
      if (promise) {
        delete game.pinCushion._requests[message.id];
        if ('error' in message) promise.reject(message.error);
        promise.resolve(data);
      }
      return;
    }

    if (!isFirstGM) return;

    // Create a Journal Entry Folder
    if (action === 'createFolder') {
      const userName = game.users.get(userId).name;
      return Folder.create({ name: userName, type: 'JournalEntry', parent: null, sorting: 'a' })
        .then((response) => {
          game.socket.emit(
            `module.${PinCushion.MODULE_NAME}`,
            {
              action: 'return',
              data: response.data,
              id: id,
            },
            { recipients: [userId] },
          );
        })
        .catch((error) => {
          game.socket.emit(`module.${PinCushion.MODULE_NAME}`, {
            action: 'return',
            error: error,
            id: id,
          });
        });
    }
  }

  static _addJournalThumbnail(app, html, data) {
    const lis = html.find('li.journal');
    for (const li of lis) {
      const target = $(li);
      const id = target.data('entity-id');
      const journalEntry = game.journal.get(id);

      if (journalEntry?.data?.img) {
        const thumbnail = $(
          '<img class="thumbnail" src="' + journalEntry.data.img + '" alt="Journal Entry Thumbnail">',
        );
        target.append(thumbnail);
      }
    }
  }

  /**
   * Helper function to register settings
   */
  static _registerSettings() {
    game.settings.registerMenu(PinCushion.MODULE_NAME, 'aboutApp', {
      name: game.i18n.localize('PinCushion.SETTINGS.AboutAppN'),
      label: game.i18n.localize('PinCushion.SETTINGS.AboutAppN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.AboutAppH'),
      icon: 'fas fa-question',
      type: PinCushionAboutApp,
      restricted: false,
    });

    game.settings.register(PinCushion.MODULE_NAME, 'showJournalPreview', {
      name: game.i18n.localize('PinCushion.SETTINGS.ShowJournalPreviewN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.ShowJournalPreviewH'),
      scope: 'client',
      type: Boolean,
      default: false,
      config: true,
      onChange: (s) => {
        if (!s) {
          delete canvas.hud.pinCushion;
        }

        canvas.hud.render();
      },
    });

    game.settings.register(PinCushion.MODULE_NAME, 'previewType', {
      name: game.i18n.localize('PinCushion.SETTINGS.PreviewTypeN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.PreviewTypeH'),
      scope: 'client',
      type: String,
      choices: {
        html: 'HTML',
        text: 'Text Snippet',
      },
      default: 'html',
      config: true,
      onChange: (s) => {},
    });

    game.settings.register(PinCushion.MODULE_NAME, 'previewMaxLength', {
      name: game.i18n.localize('PinCushion.SETTINGS.PreviewMaxLengthN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.PreviewMaxLengthH'),
      scope: 'client',
      type: Number,
      default: 500,
      config: true,
      onChange: (s) => {},
    });

    game.settings.register(PinCushion.MODULE_NAME, 'previewDelay', {
      name: game.i18n.localize('PinCushion.SETTINGS.PreviewDelayN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.PreviewDelayH'),
      scope: 'client',
      type: Number,
      default: 500,
      config: true,
      onChange: (s) => {},
    });

    game.settings.register(PinCushion.MODULE_NAME, 'defaultJournalPermission', {
      name: game.i18n.localize('PinCushion.SETTINGS.DefaultJournalPermissionN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.DefaultJournalPermissionH'),
      scope: 'world',
      type: Number,
      choices: Object.entries(CONST.ENTITY_PERMISSIONS).reduce((acc, [perm, key]) => {
        acc[key] = game.i18n.localize(`PERMISSION.${perm}`);
        return acc;
      }, {}),
      default: 0,
      config: true,
      onChange: (s) => {},
    });

    game.settings.register(PinCushion.MODULE_NAME, 'defaultJournalFolder', {
      name: game.i18n.localize('PinCushion.SETTINGS.DefaultJournalFolderN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.DefaultJournalFolderH'),
      scope: 'world',
      type: String,
      choices: {
        none: game.i18n.localize('PinCushion.None'),
        perUser: game.i18n.localize('PinCushion.PerUser'),
      },
      default: 'none',
      config: true,
      onChange: (s) => {
        // Only run check for folder creation for the main GM
        if (s === 'perUser' && game.user === game.users.find((u) => u.isGM && u.active)) {
          PinCushion._createFolders();
        }
      },
    });

    game.settings.register(PinCushion.MODULE_NAME, 'enableBackgroundlessPins', {
      name: game.i18n.localize('PinCushion.SETTINGS.EnableBackgroundlessPinsN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.EnableBackgroundlessPinsH'),
      scope: 'world',
      type: Boolean,
      default: false,
      config: true,
    });

    game.settings.register(PinCushion.MODULE_NAME, 'showJournalImageByDefault', {
      name: game.i18n.localize('PinCushion.SETTINGS.ShowJournalImageByDefaultN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.ShowJournalImageByDefaultH'),
      scope: 'world',
      type: Boolean,
      default: true,
      config: true,
    });

    game.settings.register(PinCushion.MODULE_NAME, 'playerIconAutoOverride', {
      name: game.i18n.localize('PinCushion.SETTINGS.PlayerIconAutoOverrideN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.PlayerIconAutoOverrideH'),
      scope: 'world',
      config: true,
      default: false,
      type: Boolean,
    });

    game.settings.register(PinCushion.MODULE_NAME, 'playerIconPathDefault', {
      name: game.i18n.localize('PinCushion.SETTINGS.PlayerIconPathDefaultN'),
      hint: game.i18n.localize('PinCushion.SETTINGS.PlayerIconPathDefaultH'),
      scope: 'world',
      config: true,
      default: 'icons/svg/book.svg',
      type: String,
      filePicker: true,
    });
  }
}

/**
 * @class PinCushionHUD
 *
 * A HUD extension that shows the Note preview
 */
class PinCushionHUD extends BasePlaceableHUD {
  constructor(note, options) {
    super(note, options);
    this.data = note;
  }

  /**
   * Retrieve and override default options for this application
   */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'pin-cushion-hud',
      classes: [...super.defaultOptions.classes, 'pin-cushion-hud'],
      width: 400,
      height: 200,
      minimizable: false,
      resizable: false,
      template: 'modules/pin-cushion/templates/journal-preview.html',
    });
  }

  /**
   * Get data for template
   */
  getData() {
    const data = super.getData();
    const entry = this.object.entry;
    const previewType = game.settings.get(PinCushion.MODULE_NAME, 'previewType');
    let content;

    if (previewType === 'html') {
      content = TextEditor.enrichHTML(entry.data.content, { secrets: entry.isOwner, entities: true });
    } else if (previewType === 'text') {
      const previewMaxLength = game.settings.get(PinCushion.MODULE_NAME, 'previewMaxLength');

      const textContent = $(entry.data.content).text();
      content = textContent.length > previewMaxLength ? `${textContent.substr(0, previewMaxLength)} ...` : textContent;
    }

    data.title = entry.data.name;
    data.body = content;

    return data;
  }

  /**
   * Set app position
   */
  setPosition() {
    if (!this.object) return;

    const position = {
      width: 400,
      height: 500,
      left: this.object.x,
      top: this.object.y,
      'font-size': canvas.grid.size / 5 + 'px',
    };
    this.element.css(position);
  }
}

class BackgroundlessControlIcon extends ControlIcon {
  /**
   * Override ControlIcon#draw to remove drawing of the background.
   */
  async draw() {
    // Draw border
    this.border
      .clear()
      .lineStyle(2, this.borderColor, 1.0)
      .drawRoundedRect(...this.rect, 5)
      .endFill();
    this.border.visible = false;

    // Draw icon
    this.icon.texture = this.texture ?? (await loadTexture(this.iconSrc));
    this.icon.width = this.icon.height = this.size;
    this.icon.tint = Number.isNumeric(this.tintColor) ? this.tintColor : 0xffffff;
    return this;
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Hooks                                   */
/* -------------------------------------------------------------------------- */

/**
 * Hook on init
 */
Hooks.on('init', () => {
  globalThis.PinCushion = PinCushion;
  PinCushion._registerSettings();

  libWrapper.register(
    PinCushion.MODULE_NAME,
    'NotesLayer.prototype._onClickLeft2',
    PinCushion._onDoubleClick,
    'OVERRIDE',
  );
  const enableBackgroundlessPins = game.settings.get(PinCushion.MODULE_NAME, 'enableBackgroundlessPins');
  if (enableBackgroundlessPins) {
    libWrapper.register(
      PinCushion.MODULE_NAME,
      'Note.prototype._drawControlIcon',
      PinCushion._drawControlIcon,
      'OVERRIDE',
    );
  }

  const enablePlayerIconAutoOverride = game.settings.get(PinCushion.MODULE_NAME, 'playerIconAutoOverride');
  if (enablePlayerIconAutoOverride) {
    libWrapper.register(
      PinCushion.MODULE_NAME,
      'NoteDocument.prototype.prepareData',
      PinCushion._onPrepareNoteData,
      'WRAPPER',
    );
  }
});

/*
 * Hook on ready
 */
Hooks.on('ready', () => {
  // Instantiate PinCushion instance for central socket request handling
  game.pinCushion = new PinCushion();
  // Wait for game to exist, then register socket handler
  game.socket.on(`module.${PinCushion.MODULE_NAME}`, game.pinCushion._onSocket);
});

/**
 * Hook on note config render to inject filepicker and remove selector
 */
Hooks.on('renderNoteConfig', async (app, html, data) => {
  const showJournalImageByDefault = game.settings.get(PinCushion.MODULE_NAME, 'showJournalImageByDefault');
  
  if (showJournalImageByDefault) {
    // Journal id
    const journal = game.journal.get(data.data.entryId);
    if (journal?.data.img && !app.object.getFlag(PinCushion.MODULE_NAME, 'cushionIcon')) {
      data.data.icon = journal.data.img;
    }
  }
  let tmp = data.data.icon;
  if (app.object.getFlag(PinCushion.MODULE_NAME, 'cushionIcon')) {
    data.data.icon = app.object.getFlag(PinCushion.MODULE_NAME, 'cushionIcon');
  }
  PinCushion._replaceIconSelector(app, html, data);
  await app.object.setFlag(PinCushion.MODULE_NAME, 'cushionIcon', tmp);

  const enableBackgroundlessPins = game.settings.get(PinCushion.MODULE_NAME, 'enableBackgroundlessPins');
  if (enableBackgroundlessPins) {
    PinCushion._addBackgroundField(app, html, data);
  }

  const enablePlayerIcon = game.settings.get(PinCushion.MODULE_NAME, 'playerIconAutoOverride');
  if (enablePlayerIcon ) {
    PinCushion._addPlayerIconField(app, html, data);
  }
});

/**
 * Hook on render HUD
 */
Hooks.on('renderHeadsUpDisplay', (app, html, data) => {
  const showPreview = game.settings.get(PinCushion.MODULE_NAME, 'showJournalPreview');

  if (showPreview) {
    html.append(`<template id="pin-cushion-hud"></template>`);
    canvas.hud.pinCushion = new PinCushionHUD();
  }
});

/**
 * Hook on Note hover
 */
Hooks.on('hoverNote', (note, hovered) => {
  const showPreview = game.settings.get(PinCushion.MODULE_NAME, 'showJournalPreview');
  const previewDelay = game.settings.get(PinCushion.MODULE_NAME, 'previewDelay');

  if (!showPreview) {
    return;
  }

  if (!hovered) {
    clearTimeout(game.pinCushion.hoverTimer);
    return canvas.hud.pinCushion.clear();
  }

  if (hovered) {
    game.pinCushion.hoverTimer = setTimeout(function () {
      canvas.hud.pinCushion.bind(note);
    }, previewDelay);
    return;
  }
});

/**
 * Hook on render Journal Directory
 */
Hooks.on('renderJournalDirectory', (app, html, data) => {
  PinCushion._addJournalThumbnail(app, html, data);
});
