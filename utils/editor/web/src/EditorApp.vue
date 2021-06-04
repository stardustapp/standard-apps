<template>
  <div id="editor">
    <ul id="root-tree" class="tree">
      <entry-item
        class="entry-item"
        name="Entry Tree"
        ref="tree"
        :path="''"
        :stat="{}"
        :type="'Folder'"
        :start-open="true">
      </entry-item>

      <h2>Apps</h2>

      <item-app
        v-for="root in apps"
        :key="root.name"
        ref="apptrees"
        :app="root"
      />

    </ul>

    <div id="edit-pane">
      <ul id="tab-bar">
        <li v-for="tab in tabList" class="todo-tab"
            :title="tab.key"
            @click="activateTab(tab)"
            @click.middle="closeTab(tab)"
            :key="tab.key"
            :class="{active: currentTab === tab, dirty: tab.dirty, untouched: tab.untouched}">
          <i class="material-icons tree-icon">{{tab.icon}}</i>
          <span class="label">{{tab.label}}</span>
          <i class="material-icons tree-icon close-btn"
             @click.stop="closeTab(tab)"
             title="close tab">close</i>
        </li>
      </ul>

      <component
          v-for="tab in tabList"
          v-show="tab === currentTab"
          :key="tab.key"
          :is="tab.type"
          :tab="tab"
          ref="tabElems">
      </component>
    </div>

    <div v-if="runningApp" id="run-pane">
      <ul id="tool-bar">
        <li @click="reloadApp">
          <i class="material-icons">refresh</i>
          <span class="label">refresh</span>
        </li>
        <li @click="navigateBack">
          <i class="material-icons">arrow_back</i>
          <span class="label">back</span>
        </li>
        <li @click="navigateFwd">
          <i class="material-icons">arrow_forward</i>
          <span class="label">fwd</span>
        </li>
        <li @click="closeApp">
          <i class="material-icons">close</i>
          <span class="label">close</span>
        </li>
      </ul>

      <iframe class="appframe" :src="runningApp" ref="appframe"></iframe>
    </div>
  </div>
</template>

<script>
export default {
  data: () => ({
    chartName: null,
    roots: [],
    apps: [],
    tabList: [],
    tabKeys: {},
    currentTab: null,
    runningApp: null,
  }),
  created() {
    window.editorApp = this;

    // Block navs unless everything is clean
    window.onbeforeunload = () =>
      this.tabList.find(x => x.dirty) || null;

    window.addEventListener('keydown', this.handleKeyDown);
    this.chartName = orbiter.launcher.chartName;

    skylinkP.then(x => x.enumerate('/schema', {})).then(x => {
      this.apps = x.filter(x => x.Type === 'Blob')
        .map(x => {
          const data = JSON.parse(atob(x.Data));
          return {name: x.Name, ...data};
        });
    });
  },
  destroyed() {
    window.removeEventListener('keydown', this.handleKeyDown);
  },
  methods: {

    reloadApp() {
      this.$refs.appframe.contentWindow.location.reload();
    },
    navigateBack() {
      this.$refs.appframe.contentWindow.history.back();
    },
    navigateFwd() {
      this.$refs.appframe.contentWindow.history.forward();
    },
    closeApp() {
      this.runningApp = null;
    },

    // Focus or open a new editor for given details
    openEditor(deets) {
      deets.key = [deets.path, deets.type].join(':');
      if (deets.key in this.tabKeys) {
        this.activateTab(this.tabKeys[deets.key]);
      } else {
        console.log("Opening editor", deets.key, 'labelled', deets.label);
        this.tabList.push(deets);
        this.tabKeys[deets.key] = deets;
        this.activateTab(deets);
      }
    },

    activateTab(tab) {
      // TODO: delay closing untouched tabs until another is opened
      if (tab && this.currentTab && this.currentTab !== tab && this.currentTab.untouched) {
        console.log('Closing untouched blurred tab', this.currentTab.key);
        this.closeTab(this.currentTab);
      }

      console.log("Switching to tab", tab.label);
      this.currentTab = tab;

      setTimeout(() => {
        var tabElem;
        if (this.currentTab && this.$refs.tabElems) {
          tabElem = this.$refs.tabElems
            .find(elem => (elem.tab||{}).key === this.currentTab.key);
        }

        if (tabElem && tabElem.focus) {
          console.log('focusing new tab', tabElem.label);
          tabElem.focus();
        }
      }, 1);
    },

    closeTab(tab) {
      // confirm first
      if (tab.dirty) {
        if (!confirm(`Close dirty tab ${tab.key}?`)) {
          return;
        }
      }

      // discover index of tab
      const idx = this.tabList.indexOf(tab);
      console.log("Closing tab", tab.label, "idx", idx);
      if (idx !== -1) {

        // close out the tab
        this.tabList.splice(idx, 1);
        delete this.tabKeys[tab.key];

        // if the tab was selected, clear it out
        if (this.currentTab === tab) {
          this.currentTab = null;

          // and select a replacement tab, if any...
          const newIdx = Math.min(idx, this.tabList.length-1);
          if (newIdx !== -1) {
            this.activateTab(this.tabList[newIdx]);
          }
        }
      }
    },

    // Given /n/osfs/index.html, selects the 'index.html' component or null if it's not loaded
    selectTreeNode(path) {
      // TODO: return a list from multiple trees
      var node = this.$refs.trees.find(tree => path.startsWith(tree.path));
      if (!node) { return null; }

      // get path parts after the common prefix
      const parts = path.slice(node.path.length + 1).split('/');
      if (parts.length == 1 && parts[0] === '') {
        parts.pop();
      }

      while (parts.length && node != null && 'children' in (node.$refs || {}) ) {
        const part = parts.shift();
        node = node.$refs.children.find(child => child.name === part);
      }

      if (parts.length === 0) {
        return node;
      }
    },

    offsetTabIdx(baseTab, offset) {
      const idx = this.tabList.indexOf(baseTab);
      if (idx === -1) {
        return console.log('Tab', baseTab.key, 'not found');
      }
      const newIdx = idx + offset;
      if (newIdx >= 0 && newIdx < this.tabList.length) {
        this.activateTab(this.tabList[newIdx]);
      }
    },

    handleKeyDown(evt) {
      var tab;
      if (this.currentTab && this.$refs.tabElems) {
        tab = this.$refs.tabElems
          .find(elem => (elem.tab||{}).key === this.currentTab.key);
      }

      switch (true) {

      // previous/next tab
      case evt.code === 'Comma' && evt.ctrlKey:
      case evt.code === 'BracketLeft' && evt.metaKey:
        evt.preventDefault();
        this.offsetTabIdx(tab.tab, -1);
        break;
      case evt.code === 'Period' && evt.ctrlKey:
      case evt.code === 'BracketRight' && evt.metaKey:
        evt.preventDefault();
        this.offsetTabIdx(tab.tab, 1);
        break;

      case evt.code === 'KeyS' && (evt.metaKey || evt.ctrlKey):
        if (tab) {
          evt.preventDefault();
          console.log('Saving tab:', tab.tab.label);
          tab.save();
        }
        break;

      case evt.code === 'KeyA' && evt.metaKey:
        if (tab) {
          evt.preventDefault();
          console.log('Closing tab:', tab.tab.label);
          this.closeTab(tab.tab);
        }
        break;

      case evt.code === 'KeyN' && (evt.metaKey || evt.ctrlKey):
        if (tab) {
          evt.preventDefault();
          const pathParts = tab.tab.path.slice(1).split('/');
          this.openEditor({
            type: "create-name",
            label: "create (" + pathParts[pathParts.length - 2] + ")",
            icon: "add",
            path: "/" + pathParts.slice(0, -1).join('/'),
          });
        }
        break;

      default:
        // console.log('key', evt.code, evt.metaKey, evt.ctrlKey);

      }
    },
  },
};
</script>

<style>
@media (max-width: 599px) {
}

html {
  height: 100%;
}

body {
  font-family: 'Roboto';
  background-color: #222;
  color: #fff;
  margin: 0;
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

#app {
  height: 1vh;
  display: flex;
  flex-direction: column;
  flex: 1;
}
#editor {
  display: flex;
  flex: 1;
  overflow-y: hidden;
}

.appframe {
  flex: 1;
  border-width: 0;
  background-color: #fff;
}

.folder-name {
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  transition: background-color 0.1s;
}
.folder-name:hover {
  background-color: rgba(255, 255, 255, 0.12);
}
.folder-name span {
  flex: 1;
}

.bold {
  font-weight: bold;
}

ul {
  padding-left: 1em;
  line-height: 1.5em;
  list-style: none;
  margin-bottom: 0.5em;
}

.tree-icon {
  margin-right: 5px;
}
.launch-icon {
  color: #ccc;
  text-decoration: none;
}
.launch-icon:hover {
  color: #9f9;
  padding-right: 5px;
}

.folder-name .ctxlist-icon {
  color: #034e6e;
  opacity: 0;
  transition: color 0.2s, opacity 0.2s;
  float: right;
  font-size: 20px;
  padding: 2px;
  margin: -2px;
}
.folder-name:hover .ctxlist-icon {
  color: #999;
  opacity: 0.8;
}
.folder-name .ctxlist-icon:hover {
  color: #999;
  opacity: 1;
  background-color: #111;
  border-radius: 5px;
}
.folder-name .delete-btn:hover {
  color: #f33;
}
.folder-name .reload-btn:hover {
  color: #66f;
}


#root-tree {
  min-width: 5em;
  display: flex; /* shows x-scrollbar */
  flex-direction: column;
  overflow: auto;
  margin: 0;
  padding: 1em;
  flex: 2;
  background-color: #333;
}

.sub-tree {
  padding-left: 0.6em;
  margin-left: 0.8em;
  border-left: 1px dashed #999;
  border-radius: 0 0 0 10px;
}

.create-entry-item .folder-name {
  color: #666;
  transition: color 0.3s;
}
.create-entry-item:hover .folder-name {
  color: inherit;
}

#run-pane {
  border-left: 1px solid #666;
  flex: 5;

  display: flex;
  flex-direction: column;
  width: 0;
}

#edit-pane {
  border-left: 1px solid #666;
  flex: 7;

  display: flex;
  flex-direction: column;
  width: 0;
}

#tab-bar {
  background-color: #222;
  border-bottom: 1px solid #444;
  height: 3em;
  display: flex;
  overflow-x: auto;
  align-items: flex-end;
  margin: 0;
  padding: 0.5em 1em 0;
  flex-shrink: 0;
}

#tab-bar li {
  background-color: #222;
  transition: background-color 0.2s;
  border-radius: 5px 5px 0 0;
  border: 1px solid #222;
  border-bottom: 0px;

  padding: 0.25em 0.5em;
  font-size: 0.9em;
  min-width: 14em;
  cursor: pointer;
  margin-right: 0.5em;

  display: flex;
}
#tab-bar li:hover {
  background-color: #444;
}
#tab-bar .label {
  flex: 1;
  margin: 0 0.5em;
}

#tab-bar .active {
  background-color: #333;
}
#tab-bar li:not(.active) {
  border-color: #333;
}

#tab-bar .close-btn {
  color: #222;
  transition: color 0.2s;
}
#tab-bar li:hover .close-btn {
  color: #999;
}
#tab-bar li .close-btn:hover {
  color: #f33;
  background-color: #111;
  border-radius: 5px;
}

#tab-bar .dirty {
  color: #9977ff;
}
#tab-bar .untouched {
  font-style: italic;
}

#tool-bar {
  display: flex;
  margin: 0;
  padding: 0;
}
#tool-bar li {
  display: flex;
  margin: 0.2em;
  padding: 0.2em;
  background-color: #333;
  border: 1px solid transparent;
}
#tool-bar li:hover {
  cursor: pointer;
  border-color: #666;
}

.panel-parent {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #333;
  overflow-y: hidden;
}
.form-panel {
  padding: 1em;
  display: flex;
  flex-direction: column;
  max-width: 30em;
}
.form-row {
  display: flex;
  flex-shrink: 0;
  margin: 0.5em 0;
  align-items: center;
}
h3.form-row {
  margin: 0;
  font-size: 2em;
  font-weight: normal;
  text-transform: lowercase;
  border-bottom: 2px solid #666;
  color: #999;
  margin-bottom: 1em;
}
.form-row span {
  flex-basis: 5em;
}
.form-row [readonly] {
  color: #999;
}
.form-row input, .form-row select, .form-row button {
  padding: 0.5em 1em;
  background-color: #222;
  border: 1px solid #999;
  border-radius: 3px;
  font-size: 1.2em;
  color: #eee;
  flex: 1;
}
.form-row input, .form-row select {
  margin-left: 1em;
}
.form-row:hover input, .form-row:hover select, .form-row button:hover {
  box-shadow: 0 0 4px 2px rgba(255, 255, 255, 0.2);
  border-color: #ccc;
  background-color: #444;
}
form p {
  margin: 0;
}
.func-output {
  overflow: auto;
  margin: 0;
  padding: 1em;
  flex: 1;
}

.panel-parent .CodeMirror {
  flex: 1;
  font-family: 'Fira Code', monospace;
  /*font-variant-ligatures: contextual;*/
}

.editor-toolbar {
  display: flex;
  font-size: 0.9em;
}
.editor-toolbar .button-group {
  margin: 0 0.5em;
  border-left: 1px solid #444;
}
.editor-toolbar .button-group button {
  background: none;
  border: 0px solid #444;
  color: #ddd;
  padding: 0.3em 0.5em;
  border-right-width: 1px;
}
.editor-toolbar .button-group button:hover {
  color: #fff;
  border-color: #999;
  background-color: rgba(255, 255, 255, 0.2);
  border-left-width: 1px;
  margin-left: -1px;
  cursor: pointer;
}
.editor-toolbar .input-group {
  margin: 0 0.3em;
  display: flex;
}
.editor-toolbar .input-group:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
.editor-toolbar .input-group:hover * {
  color: #fff;
}
.editor-toolbar .label-text {
  align-self: center;
  padding: 0 0.5em;
  color: #888;
}
.editor-toolbar [type=text] {
  background-color: transparent;
  border: 1px solid #555;
  border-width: 0 1px 0 1px;
  color: #ccc;
  padding: 0 0.5em;
  font-size: 1em;
  align-self: stretch;
}

</style>
