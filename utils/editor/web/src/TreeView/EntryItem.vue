<template>
  <li class="entry-item">
    <div
      class="folder-name"
      @click="activate">
      <i class="material-icons tree-icon">{{icon}}</i>
      <span class="name">{{name}}</span>
      <a v-if="canLaunch" class="material-icons launch-icon"
          :href="launchUri" @click.stop.prevent="launch"
          title="launch app plugin"
          >launch</a>
      <i v-if="isFolder" class="material-icons ctxlist-icon reload-btn"
          @click.stop="reload"
          title="refresh folder's children"
          >refresh</i>
      <i class="material-icons ctxlist-icon delete-btn"
         @click.stop="deleteEntry"
         title="remove entry from this folder">delete</i>
    </div>

    <ul v-show="open" v-if="isFolder" class="sub-tree">
      <entry-item
        v-for="child in entry.Children"
        ref="children"
        :key="child.Name"
        :name="child.Name"
        :type="child.Type"
        :stat="child"
        :path="child.Path"
        :start-open="name === 'sd://apt.danopia.net'">
      </entry-item>

      <create-entry-item
        :parent="path"
        :parentName="name">
      </create-entry-item>
    </ul>
  </li>
</template>

<script>
export default {
  props: {
    stat: Object,
    name: String,
    type: String,
    path: String,
    startOpen: Boolean,
  },
  data() {
    return {
      entry: {},
      open: !!this.startOpen,
      loader: this.startOpen ? this.load() : null,
    };
  },
  computed: {
    isFunction() {
      return this.stat.Shapes &&
          this.stat.Shapes.indexOf('/rom/shapes/function') !== -1;
    },
    canLaunch() {
      return this.path.match(/^\/web\/[a-z]+$/) || (this.stat.Shapes &&
          this.stat.Shapes.indexOf('/rom/shapes/web-app') !== -1);
    },
    launchUri() {
      return '/~' + orbiter.launcher.chartName + this.path.replace(/^\/web/, '') + '/';
    },
    isFolder() {
      return this.type === "Folder";
    },
    icon() {
      if (this.isFunction || this.stat.Type === 'Function') {
        return "flash_on"; // lightning bolt
      }
      if (this.canLaunch) {
        return "web"; // web app
      }
      switch (this.type) {
        case "Folder":
          return this.open ? "folder_open" : "folder";
        case undefined: // TODO: unugly
          return this.open ? "expand_less" : "chevron_right";
        case "Error":
          return "error";
        default:
          return "insert_drive_file";
      }
    },
  },
  methods: {
    launch() {
      console.log('Launching app', this.path);
      editorApp.runningApp = this.launchUri;
    },
    deleteEntry() {
      const {path} = this;
      if (confirm(`Are you sure you want to PERMENENTLY DELETE ${path}`)) {
        if (confirm(`For real? ${path} should be sent to the garbage collector?`)) {
          skylink.unlink(path).then(() => {
            alert(`${path} is no more.`);
            const parent = editorApp.selectTreeNode(path.split('/').slice(0,-1).join('/'));
            if (parent != null && parent.reload) {
              parent.reload();
            } else {
              console.warn(`no parent found for ${path}`);
            }
          }, err => {
            alert(`Sorry. I couldn't do it.`);
            console.log(err);
          });
        }
      }
    },
    activate() {
      if (this.isFunction) {
        editorApp.openEditor({
          type: 'invoke-function',
          label: this.name,
          icon: 'flash_on',
          path: this.path,
          bare: false,
        });
        return;
      }

      switch (this.type) {
        case 'Folder':
          this.open = !this.open;
          this.load();
          break;

        case 'Blob':
          editorApp.openEditor({
            type: 'edit-blob',
            label: this.name,
            icon: 'edit',
            path: this.path,
            dirty: false,
            untouched: true,
          });
          break;

        case 'String':
          editorApp.openEditor({
            type: 'edit-string',
            label: this.name,
            icon: 'edit',
            path: this.path,
            dirty: false,
            untouched: true,
          });
          break;

        case 'Function':
          editorApp.openEditor({
            type: 'invoke-function',
            label: this.name,
            icon: 'flash_on',
            path: this.path,
            bare: true,
          });
          break;
      }
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
