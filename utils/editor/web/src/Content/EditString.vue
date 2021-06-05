<template>
<div class="panel-parent">
  <form class="form-panel"
      @submit.prevent="save">
    <h3 class="form-row">Edit String</h3>
    <label class="form-row">
      <span>Value:</span>
      <input
          type="text"
          name="value"
          v-model="value"
          autofocus
          required
          @change="onChange"
        >
    </label>
    <div class="form-row">
      <button type="submit">Save</button>
    </div>
  </form>
</div>
</template>

<script>
import { debounce } from '../lib/debounce.js';
export default {
  props: {
    tab: Object,
  },
  data() {
    const pathParts = this.tab.path.split('/');
    return {
      source: '',
      value: '',
    };
  },
  computed: {
    parentPath() {
      const pathParts = this.tab.path.split('/');
      return pathParts.slice(0, -1).join('/');
    },
  },
  methods: {
    onChange() {
      this.tab.dirty = (this.value !== this.source);

      // once a string is touched, let's keep it open
      if (this.tab.dirty) {
        this.tab.untouched = false;
      }
    },

    save() {
      skylink.putString(this.tab.path, this.value).then(x => {
        alert('Saved');

        // update the dirty marker
        this.source = this.value;
        this.onChange();

        // If this string didn't exist yet, dirty the treeview
        if (this.tab.isNew === true) {
          this.tab.isNew = false;

          const parent = editorApp.selectTreeNode(this.parentPath);
          if (parent != null && parent.reload) {
            parent.reload();
          }
        }
      });
    },
  },

  created() {
    this.onChange = debounce(this.onChange, 100);

    if (!this.tab.isNew) {
      skylink
        .loadString(this.tab.path)
        .then(x => {
          this.source = x;
          this.value = x;
        });
    }
  },
}
</script>
