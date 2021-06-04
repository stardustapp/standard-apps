import * as DustClientVue from '@dustjs/client-vue';
Vue.use(DustClientVue.AppPlugin);
Vue.use(DustClientVue.MixinPlugin);

import EditorApp from './EditorApp.vue';
import Codemirror from './lib/Codemirror.vue';
import CreateEntryItem from './TreeView/CreateEntryItem.vue';
import CreateName from './Content/CreateName.vue';
import EditBlob from './Content/EditBlob.vue';
import EditString from './Content/EditString.vue';
import EntryItem from './TreeView/EntryItem.vue';
import InvokeFunction from './Content/InvokeFunction.vue';
import ItemApp from './TreeView/ItemApp.vue';
import ItemCollection from './TreeView/ItemCollection.vue';
Vue.component('editor-app', EditorApp);
Vue.component('codemirror', Codemirror);
Vue.component('create-entry-item', CreateEntryItem);
Vue.component('create-name', CreateName);
Vue.component('edit-blob', EditBlob);
Vue.component('edit-string', EditString);
Vue.component('entry-item', EntryItem);
Vue.component('invoke-function', InvokeFunction);
Vue.component('item-app', ItemApp);
Vue.component('item-Collection', ItemCollection);

// TODO: codemirror uses this
window.require = function (names) {
  console.log("'Requiring'", names)
}

import './lib/codemirror-mustache.js';

window.skylink = null;
DustClientVue.bootNow().then(app => {
  window.skylinkP.then(x => window.skylink = x);
})
