<template>
  <li class="create-entry-item">
    <div
      class="folder-name"
      @click="activate">
      <i class="material-icons tree-icon">add</i>
      create...
    </div>
  </li>
</template>

<script>
export default {
  props: {
    parent: String,
    parentName: String,
  },
  methods: {
    activate() {
      editorApp.openEditor({
        type: 'create-name',
        label: 'create (' + this.parentName + ')',
        icon: 'add',
        path: this.parent,
      });
    },
  }
}
</script>
