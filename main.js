const { MarkdownView, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
const { foldEffect, foldable, foldedRanges, unfoldEffect } = require("@codemirror/language");
const { Decoration, ViewPlugin } = require("@codemirror/view");

const DEFAULT_SETTINGS = {
  centerTables: true,
};

function positionIsFolded(state, position) {
  let folded = false;
  foldedRanges(state).between(position, Math.min(position + 1, state.doc.length), (from, to) => {
    if (from <= position && position <= to) {
      folded = true;
    }
  });
  return folded;
}

function headingIsFolded(state, heading) {
  const range = foldable(state, heading.from, heading.to);
  if (!range) {
    return false;
  }

  let folded = false;
  foldedRanges(state).between(range.from, range.to, (from, to) => {
    if (from <= range.from && to >= range.to) {
      folded = true;
    }
  });
  return folded;
}

function headingLevel(heading) {
  return /^(#{2,6})\s/.exec(heading.text)[1].length;
}

function lastContentLineBefore(state, position) {
  let line = state.doc.lineAt(Math.max(0, Math.min(position - 1, state.doc.length)));

  while (line.number > 1 && line.text.trim() === "") {
    line = state.doc.line(line.number - 1);
  }
  return line;
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

  const allHeadings = [...levelTwoHeadings, ...lowerHeadings]
    .sort((first, second) => first.from - second.from);
  const decorations = [];
  lowerHeadings.forEach((heading) => {
    if (!headingIsFolded(view.state, heading)) {
      decorations.push(
        Decoration.line({ attributes: { class: "replier-tout-titre-deplie" } })
          .range(heading.from),
      );

      const level = headingLevel(heading);
      const nextBoundaryHeading = allHeadings.find(
        (candidate) => candidate.from > heading.from && headingLevel(candidate) <= level,
      );

      if (!nextBoundaryHeading || headingLevel(nextBoundaryHeading) > 2) {
        const sectionEnd = nextBoundaryHeading
          ? nextBoundaryHeading.from
          : view.state.doc.length + 1;
        const lastContentLine = lastContentLineBefore(view.state, sectionEnd);

        if (lastContentLine.from !== heading.from) {
          decorations.push(
            Decoration.line({ attributes: { class: "replier-tout-fin-titre-deplie" } })
              .range(lastContentLine.from),
          );
        }
      }
    }
  });

  levelTwoHeadings.forEach((heading, index) => {
    const nextHeading = levelTwoHeadings[index + 1];
    const sectionEnd = nextHeading ? nextHeading.from : view.state.doc.length + 1;
    const sectionLowerHeadings = lowerHeadings.filter(
      (line) => line.from > heading.to && line.from < sectionEnd,
    );
    const firstLowerHeading = sectionLowerHeadings[0];
    const lastLowerHeading = sectionLowerHeadings[sectionLowerHeadings.length - 1];
    const hasLowerHeading = Boolean(firstLowerHeading);
    const sectionIsFolded = firstLowerHeading
      ? positionIsFolded(view.state, firstLowerHeading.from)
      : false;
    const isLastNumberedHeading = /^##\s+\d/.test(heading.text)
      && (!nextHeading || !/^##\s+\d/.test(nextHeading.text));
    const isSourcesHeading = /^##\s+(?:🌐\s*)?Sources\s*$/i.test(heading.text);
    let showSeparator = index === 0;

    if (index > 0) {
      const previousHeading = levelTwoHeadings[index - 1];
      const previousFirstLowerHeading = lowerHeadings.find(
        (line) => line.from > previousHeading.to && line.from < heading.from,
      );

      if (previousFirstLowerHeading) {
        showSeparator = !positionIsFolded(view.state, previousFirstLowerHeading.from);
      } else {
        const sectionPosition = Math.min(previousHeading.to + 1, heading.from - 1);
        showSeparator = !positionIsFolded(view.state, sectionPosition);
      }
    }

    const classes = [];
    if (showSeparator) {
      classes.push("replier-tout-separateur");
    }
    if (hasLowerHeading && !sectionIsFolded) {
      classes.push("replier-tout-partie-deplie");
    }
    if ((!hasLowerHeading && !isSourcesHeading) || (isLastNumberedHeading && sectionIsFolded)) {
      classes.push("replier-tout-sans-sous-titre");
    }

    if (classes.length > 0) {
      decorations.push(
        Decoration.line({ attributes: { class: classes.join(" ") } }).range(heading.from),
      );
    }

    if (nextHeading && lastLowerHeading && !sectionIsFolded) {
      decorations.push(
        Decoration.line({ attributes: { class: "replier-tout-dernier-sous-titre" } })
          .range(lastLowerHeading.from),
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
  async onload() {
    await this.loadSettings();
    this.applyTableAlignment();
    this.viewsWithActions = new WeakSet();
    this.registerEditorExtension(sectionSeparatorExtension);
    this.addNoteActions();
    this.addSettingTab(new ReplierToutSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addNoteActions()));
  }

  onunload() {
    document.body.removeClass("replier-tout-tableaux-centres");
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyTableAlignment();
  }

  applyTableAlignment() {
    document.body.toggleClass("replier-tout-tableaux-centres", this.settings.centerTables);
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

class ReplierToutSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Centrer les tableaux")
      .setDesc("Centre les tableaux et conserve le même espace avant et après")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.centerTables)
        .onChange(async (value) => {
          this.plugin.settings.centerTables = value;
          await this.plugin.saveSettings();
        }));
  }
}
