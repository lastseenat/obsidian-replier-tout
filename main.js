const { MarkdownView, Notice, Plugin } = require("obsidian");
const { foldEffect, foldable, foldedRanges, unfoldEffect } = require("@codemirror/language");
const { Decoration, ViewPlugin } = require("@codemirror/view");

function positionIsFolded(state, position) {
  let folded = false;
  foldedRanges(state).between(position, Math.min(position + 1, state.doc.length), (from, to) => {
    if (from <= position && position <= to) {
      folded = true;
    }
  });
  return folded;
}

function buildSectionSeparators(view) {
  const levelTwoHeadings = [];
  const lowerHeadings = [];

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const match = /^(#{2,6})\s/.exec(line.text);
    if (!match) {
      continue;
    }

    if (match[1].length === 2) {
      levelTwoHeadings.push(line);
    } else {
      lowerHeadings.push(line);
    }
  }

  const decorations = [];
  levelTwoHeadings.forEach((heading, index) => {
    const nextHeading = levelTwoHeadings[index + 1];
    const sectionEnd = nextHeading ? nextHeading.from : view.state.doc.length + 1;
    const hasLowerHeading = lowerHeadings.some(
      (line) => line.from > heading.to && line.from < sectionEnd,
    );
    let showSeparator = index === 0;

    if (index > 0) {
      const previousHeading = levelTwoHeadings[index - 1];
      const firstLowerHeading = lowerHeadings.find(
        (line) => line.from > previousHeading.to && line.from < heading.from,
      );

      if (firstLowerHeading) {
        showSeparator = !positionIsFolded(view.state, firstLowerHeading.from);
      } else {
        const sectionPosition = Math.min(previousHeading.to + 1, heading.from - 1);
        showSeparator = !positionIsFolded(view.state, sectionPosition);
      }
    }

    const classes = [];
    if (showSeparator) {
      classes.push("replier-tout-separateur");
    }
    if (!hasLowerHeading) {
      classes.push("replier-tout-sans-sous-titre");
    }

    if (classes.length > 0) {
      decorations.push(
        Decoration.line({ attributes: { class: classes.join(" ") } }).range(heading.from),
      );
    }
  });

  return Decoration.set(decorations, true);
}

const sectionSeparatorExtension = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildSectionSeparators(view);
    }

    update(update) {
      this.decorations = buildSectionSeparators(update.view);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

module.exports = class ReplierToutPlugin extends Plugin {
  onload() {
    this.viewsWithActions = new WeakSet();
    this.registerEditorExtension(sectionSeparatorExtension);
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
      view.addAction("chevrons-down", "Déplier tout", () => this.unfoldAll());
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
        const endsWithLineBreak = state.doc.sliceString(range.to - 1, range.to) === "\n";
        const visibleLineBreakRange = endsWithLineBreak
          ? { from: range.from, to: range.to - 1 }
          : range;

        effects.push((fold ? foldEffect : unfoldEffect).of(visibleLineBreakRange));
      }
    }

    if (effects.length > 0) {
      editorView.dispatch({ effects });
    }
  }

  unfoldAll() {
    this.app.commands.executeCommandById("editor:unfold-all");
  }
};
