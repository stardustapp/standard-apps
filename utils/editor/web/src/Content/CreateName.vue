<template>
<div class="panel-parent">
  <form class="form-panel"
      @submit.prevent="submit">
    <h3 class="form-row">Create Entry</h3>
    <label class="form-row">
      <span>Parent:</span>
      <input type="text" name="parent" :value="tab.path" readonly>
    </label>
    <label class="form-row">
      <span>Name:</span>
      <input type="text" name="name" v-model="name" autofocus required>
    </label>
    <label class="form-row">
      <span>Type:</span>
      <select name="type" v-model="type">
        <option>String</option>
        <option>Blob</option>
        <option>Folder</option>
      </select>
    </label>
    <div class="form-row">
      <button type="submit">Save</button>
    </div>
  </form>
</div>
</template>

<script>
import { Skylink } from '@dustjs/client';
export default {
  props: {
    tab: Object,
  },
  data() {
    return {
      name: '',
      type: 'Blob',
    };
  },
  computed: {
  },
  methods: {
    submit() {
      if (!this.name.length) {
        alert("Enter a name!");
        return;
      }
      const fullPath = this.tab.path + '/' + encodeURIComponent(this.name);

      switch (this.type) {
      case "Blob":
        // Don't actually create yet, just open a buffer
        editorApp.openEditor({
          type: "edit-blob",
          icon: "edit",
          label: this.name,
          path: fullPath,
          isNew: true,
          dirty: true,
        });
        editorApp.closeTab(this.tab);
        break;

      case "String":
        // Don't actually create yet, just open a buffer
        editorApp.openEditor({
          type: "edit-string",
          icon: "edit",
          label: this.name,
          path: fullPath,
          isNew: true,
          dirty: true,
        });
        editorApp.closeTab(this.tab);
        break;

      case "Folder":
        skylink.store(fullPath, Skylink.Folder(this.name)).then(x => {
          alert('Created');
          const parent = editorApp.selectTreeNode(this.tab.path);
          if (parent != null && parent.reload) {
            parent.reload();
            // TODO: ensure child is already open
          }
          editorApp.closeTab(this.tab);
        });
        break;

      default:
        alert(`I don't know how to make a ${this.type} yet`)
      }
    },
  }
}
</script>
