const { Notice, Plugin } = require("obsidian");

const FOLD_ALL_COMMAND = "editor:fold-all";

module.exports = class ReplierToutPlugin extends Plugin {
  onload() {
    this.addRibbonIcon(
      "chevrons-up",
      "Replier tous les titres et les listes",
      () => this.foldAll(),
    );

    this.addCommand({
      id: "replier-tout",
      name: "Replier tous les titres et les listes",
      callback: () => this.foldAll(),
    });
  }

  foldAll() {
    const command = this.app.commands.commands[FOLD_ALL_COMMAND];
    if (!command) {
      new Notice("Ouvre une note Markdown avant de replier son contenu");
      return;
    }

    this.app.commands.executeCommandById(FOLD_ALL_COMMAND);
  }
};
