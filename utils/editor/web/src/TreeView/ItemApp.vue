<template>
  <li class="entry-item">
    <div class="folder-name">
      <i class="material-icons tree-icon">extension</i>
      <span class="name">{{app.metadata.AppName}}</span>
    </div>

    <ul class="sub-tree">
      <component v-bind:is="'item-'+child.item.family"
        v-for="child in parents"
        ref="children"
        :key="child.name"
        :item="child.item"
        :name="child.name"
        :path="child.path">
      </component>
    </ul>
  </li>
</template>

<script>
export default {
  props: {
    app: Object,
  },
  computed: {
    parents() {
      const parents = [];
      for (const region of this.app.roots) {
        if (region.family != "AppRegion") {
          console.warn('Weird family', region.family, 'at top of', this.path);
          continue;
        }
        const {regionName, names} = region;

        for (const [name, root] of names) {
          // skip completely empty roots
          if (root.family === 'Document' && root.names.length === 0) continue;

          // console.log(this.path, regionName, name, JSON.stringify(root, null, 2));
          parents.push({
            path: `/${regionName}/${this.app.name}/${name}`,
            name: name,
            item: root,
          });
        }
      }
      return parents;
    },
  },
}
</script>
