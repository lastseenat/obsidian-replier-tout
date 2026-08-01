const { MarkdownView, Notice, Plugin } = require("obsidian");
const { foldEffect, foldable, unfoldEffect } = require("@codemirror/language");

module.exports = class ReplierToutPlugin extends Plugin {
  onload() {
    this.viewsWithActions = new WeakSet();
    this.addNoteActions();
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addNoteActions()));
  }

  addNoteActions() {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || this.viewsWithActions.has(view)) {
        return;
      }

      view.addAction("chevrons-up", "Replier les titres", () => this.setHeadingFolds(view, true));
      view.addAction("chevrons-down", "Déplier les titres", () => this.setHeadingFolds(view, false));
      this.viewsWithActions.add(view);
    });
  }

  setHeadingFolds(markdownView, fold) {
    const editorView = markdownView.editor?.cm;
    if (!editorView) {
      new Notice("Passe en mode édition pour replier ou déplier les titres");
      return;
    }

    const effects = [];
    const { state } = editorView;

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      if (!/^#{1,6}\s/.test(line.text)) {
        continue;
      }

      const range = foldable(state, line.from, line.to);
      if (range) {
        effects.push((fold ? foldEffect : unfoldEffect).of(range));
      }
    }

    if (effects.length > 0) {
      editorView.dispatch({ effects });
    }
  }
};
