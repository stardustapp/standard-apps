<template>
  <div class="panel-parent cm-panel">
    <div class="editor-toolbar">
      <div class="button-group">
        <button @click="save" title="Store new version">
          <i class="material-icons">save</i>
        </button>
      </div>

      <label class="input-group">
        <div class="label-text">MIME type:</div>
        <input
            type="text"
            name="mimeType"
            v-model="mimeType"
            required
          >
      </label>
    </div>

    <codemirror
        ref="editor"
        :code="source"
        :options="editorOptions"
        @change="onChange"
      ></codemirror>
  </div>
</template>

<script>
import { debounce } from '../lib/debounce.js';
import { Skylink } from '@dustjs/client';
export default {
  props: {
    tab: Object,
  },
  data() {
    const pathParts = this.tab.path.split('/');
    return {
      source: '',
      mimeType: '',
      editorOptions: {
        tabSize: 2,
        mode: {
          filename: pathParts[pathParts.length - 1],
        },
        styleActiveLine: true,
        lineWrapping: true,
        lineNumbers: true,
        line: true,
        styleSelectedText: true,
        matchBrackets: true,
        showCursorWhenSelecting: true,
        theme: "tomorrow-night-bright",
        extraKeys: {
          "Ctrl": "autocomplete",
        },
      }
    };
  },
  watch: {
    mimeType(newMime) {
      if (!newMime) return;
      this.editor.setOption("mode", newMime.split(';')[0]);
    },
  },
  computed: {
    parentPath() {
      const pathParts = this.tab.path.split('/');
      return pathParts.slice(0, -1).join('/');
    },
    editor() {
      return this.$refs.editor.editor;
    },
  },
  methods: {
    onChange() {
      this.tab.dirty = (this.editor.getValue() !== this.source);

      // once a file is touched, let's keep it open
      if (this.tab.dirty) {
        this.tab.untouched = false;
      }
    },

    save() {
      // TODO: cleaning should be opt-in. via MIME?
      const input = this.editor.getValue();
      const source = input.replace(/\t/g, '  ').replace(/ +$/gm, '');
      if (input != source) {
        // TODO: transform cursor to account for replacement

        // take viewport notes
        const cursor = this.editor.getCursor();
        const scrollerEl = this.editor.getScrollerElement();
        const { scrollTop } = scrollerEl;

        // do the update
        this.editor.setValue(source);

        // reset viewport
        scrollerEl.scrollTop = scrollTop;
        setTimeout(() => {
          scrollerEl.scrollTop = scrollTop;
        }, 1);

        this.editor.setCursor(cursor);
        console.log('Updated buffer to cleaned version of source');
      }

      const blob = Skylink.Blob('codemirror', source, this.mimeType);
      skylink.store(this.tab.path, blob).then(x => {
        alert('Saved');

        // update the dirty marker
        this.source = source;
        this.onChange();

        // If this file didn't exist yet, dirty the treeview
        if (this.tab.isNew === true) {
          this.tab.isNew = false;

          const parent = editorApp.selectTreeNode(this.parentPath);
          if (parent != null && parent.reload) {
            parent.reload();
          }
        }
      });
    },

    focus() {
      this.editor.focus();
    },
  },

  mounted() {
    this.onChange = debounce(this.onChange, 250);

    if (this.tab.isNew) {
      this.editor.setOption("readOnly", false);
      this.editor.focus();
    } else {
      this.editor.setOption("readOnly", true);
      skylink
        .loadBlob(this.tab.path)
        .then(x => {
          this.source = x.asText();
          this.mimeType = x.mimeType;
          setTimeout(() => {
            this.editor.setOption("readOnly", false);
            this.editor.clearHistory();
            this.editor.focus();
          }, 1);
        });
    }
  },
}
</script>
