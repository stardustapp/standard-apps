<template>
  <li class="entry-item">
    <div
      class="folder-name"
      @click="activate">
      <i class="material-icons tree-icon">{{icon}}</i>
      <span class="name">{{name}}</span>
      <i class="material-icons ctxlist-icon reload-btn"
          @click.stop="reload"
          title="refresh folder's children"
          >refresh</i>
    </div>

    <ul v-show="open" class="sub-tree">
      <component v-bind:is="'item-'+item.inner.Family"
        v-for="child in entry.Children"
        ref="children"
        :key="child.Name"
        :item="item.inner"
        :name="child.Name"
        :path="child.Path"
        />
      <create-entry-item
        :parent="path"
        :parentItem="item"
        :parentName="name"
        />
    </ul>
  </li>
</template>

<script>
export default {
  props: {
    name: String,
    path: String,
    item: Object,
  },
  data() {
    return {
      entry: {},
      open: false,
      loader: null, // this.startOpen ? this.load() : null,
    };
  },
  computed: {
    icon() {
      return this.open ? "folder_open" : "folder";
    },
  },
  methods: {
    activate() {
      this.open = !this.open;
      if (this.open) this.load();
    },
    load() {
      if (!this.loader) {
        this.loader = skylinkP.then(x => x.enumerate(this.path, {})).then(x => {
          this.entry = x.splice(0, 1)[0];
          this.entry.Children = x.sort((a, b) => {
            var nameA = a.Name.toUpperCase();
            var nameB = b.Name.toUpperCase();
            if (nameA < nameB) { return -1; }
            if (nameA > nameB) { return 1; }
            return 0;
          });

          // unescape the 'paths' - we already know there's only 1 part
          for (const child of x) {
            child.Path = this.path + '/' + child.Name;
            child.Name = decodeURIComponent(child.Name);
          }
        });
      }
      return this.loader;
    },
    reload() {
      this.loader = null;
      return this.load();
    },
  },
}
</script>
