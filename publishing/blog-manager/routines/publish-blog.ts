import {
  BlobEntry, Entry, EnumerationWriter, FolderEntry, interpretUrl, StringEntry,
} from "/home/dan/Code/@stardustapp/dust-typescript/skylink/src/mod.ts";
import { Marked } from "https://deno.land/x/markdown@v2.0.0/mod.ts";
import Mustache from 'https://deno.land/x/mustache@v0.2.1/mustache.mjs';
import * as Base64 from 'https://deno.land/x/base64@v0.2.1/mod.ts';

const startTime = Date.now();

console.log('Connecting to profile server...');
const [client, rootPath] = interpretUrl(Deno.args[0] ?? '/');
await client.performOp({Op: 'ping'});

async function getChildrenOf(path: string, depth: number) {
  const listing = await client.performOp({
    Op: 'enumerate',
    Path: rootPath+path,
    Depth: depth,
  });
  if (listing?.Type !== 'Folder') throw new Error(`BUG`);
  const enumer = new EnumerationWriter(depth);
  enumer.visitEnumeration(listing);
  const output = enumer.reconstruct();
  if (output.Type !== 'Folder') throw new Error(`BUG`);
  return output.Children;
}
function readStructure(children: Entry[]) {
  const data: Record<string,string> = {};
  for (const child of children) {
    if (child.Type !== 'String') continue;
    data[child.Name.replace(/ [a-z]/g, x => x[1].toUpperCase())] = child.StringValue;
  }
  return data;
}
function readMap<T>(children: Entry[], reader: (children: Entry[]) => T): Map<string,T> {
  const data: Map<string,T> = new Map;
  for (const child of children) {
    if (child.Type !== 'Folder') continue;
    data.set(child.Name, reader(child.Children));
  }
  return data;
}

console.log('Loading blog configuration...');
const config = await getChildrenOf('/config/blog/prefs', 3);
const prefs = readStructure(config);

const siteTitle = prefs.siteTitle || 'New Blog';
const siteSubtitle = prefs.siteSubtitle || 'Content goes here';
const sections = readMap((config.find(x => x.Name === 'sections') as FolderEntry).Children, readStructure)
// console.log(siteTitle, siteSubtitle, sections);

// load all the asset & layout files into a Map
const assetsRaw = await getChildrenOf('/persist/blog/assets', 2);
const assets = readMap(assetsRaw, x => x.find(y => y.Name === 'data') as BlobEntry);

// const layouts = new Map
// console.log(assets);

console.log('Loading pages and posts...');

// function renderInnerHtml(content) {
//   if (content.html) {
//     return content.html.load().wait().toString('utf-8');
//   } else if (content.markdown) {
//     return markdown.toHTML(content.markdown.load().wait().toString('utf-8'));
//   }
//   throw new Error("No innerHtml for content");
// }

async function loadContentNodes(path: string) {
  const nodesRaw = await getChildrenOf(path, 3);
  // console.log(nodesRaw);
  return nodesRaw.map(raw => {
    const data = readStructure((raw as FolderEntry).Children);
    return {
      path: `${raw.Name}.html`,
      title: data.title || raw.Name,
      section: sections.get(data.section),
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      // innerHtml: renderInnerHtml(data),
      // raw: data,
    };
  }).sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return a.publishedAt.valueOf() - b.publishedAt.valueOf();
  });
}
const pages = await loadContentNodes('/persist/blog/pages');
const posts = await loadContentNodes('/persist/blog/posts');
console.log(pages, posts);

// // TODO: don't require photos/ to exist
// const photosPath = '/data/blog/photos';
// const photos = profile.listChildNames(photosPath).wait().map(slug => {
//   const struct = profile.loadDataStructure(photosPath+'/'+slug, 2).wait();
//   return struct;
// });

// const outdatedCutoff = moment.utc().subtract(5, 'years');
// posts.forEach(p => {
//   const publishedAt = moment.utc(p.raw.publishedAt);
//   if (p.raw.publishedAt && publishedAt.isValid()) {
//     p.publishDate = publishedAt.format('LL [at] LT');
//     p.publishedAt = p.raw.publishedAt;
//     p.publishedMoment = publishedAt;
//     p.isOutdated = publishedAt < outdatedCutoff;
//     p.path = `posts/${publishedAt.format('YYYY')}/${p.path}`;
//   } else {
//     p.path = `posts/drafts/${p.path}`;
//   }
// });
// posts.sort(function (a, b) {
//   return (b.publishedAt||'').localeCompare(a.publishedAt||'');
// });
// const publishedPosts = posts.filter(x => x.publishDate);

// console.log('Generating blog files...');

// // helper to pass a data object though one layout, then the site layout
// // special page? don't pass a layout, pass html as data.innerHtml instead
// function renderPage(data, layout) {
//   var {innerHtml, baseHref} = data;
//   if (layouts.has(layout)) {
//     innerHtml = Mustache.render(layouts.get(layout), data);
//   }
//   if (!innerHtml) throw new Error("No innerHtml for content");

//   if (!layouts.has('default')) throw new Error(
//     `Layout 'default' not found`);

//   const pageBody = Mustache.render(layouts.get('default'), {
//     siteTitle, siteSubtitle,
//     pages, posts, photos,
//     innerHtml, baseHref,
//   }).replace(/&#x2F;/g, '/')
//     .replace(/&#x3D;/g, '=');
//   return Buffer.from(pageBody, 'utf-8');
// }

// function reversePath(path) {
//   if (path.includes('/')) {
//     return path.split('/').slice(1).map(x => '..').join('/');
//   } else {
//     return '.';
//   }
// }

// const htmlFiles = [];
// function renderContentNodes(list, layout) {
//   list.forEach(content => {
//     content.baseHref = reversePath(content.path);
//     htmlFiles.push({
//       path: '/'+content.path,
//       body: renderPage(content, layout),
//     });
//   });
// }
// renderContentNodes(pages, 'page');
// renderContentNodes(posts, 'post');

// const nowM = moment.utc();
// htmlFiles.push({
//   path: '/index.html',
//   body: renderPage({
//     pages, photos,
//     recentPosts: publishedPosts
//       .slice(0, 5)
//       .filter(x => x.publishedMoment.diff(nowM, 'years') > -1),
//   }, 'home'),
// });

// const newestYear = publishedPosts[0].publishedMoment.year();
// const oldestYear = publishedPosts.slice(-1)[0].publishedMoment.year();
// const postTimes = [];
// for (let year = newestYear; year >= oldestYear; year--) {
//   for (let month = 11; month >= 0; month--) {
//     const posts = publishedPosts.filter(x =>
//       x.publishedMoment.year() === year &&
//       x.publishedMoment.month() === month);
//     if (posts.length === 0) continue;

//     const timeStr = posts[0].publishedMoment.format('MMMM YYYY');
//     postTimes.push({ year, month, timeStr, posts });
//   }
// }

// htmlFiles.push({
//   path: '/posts/archive.html',
//   body: renderPage({
//     baseHref: '..',
//     postTimes,
//   }, 'archive'),
// });

// console.log('Uploading', htmlFiles.length, 'HTML files to web hosting...');
// htmlFiles.forEach(({path, body}) => {
//   hosting.callApi('putBlob', '/domain/public/web'+path, body, 'text/html; charset=utf-8').wait();
// });

// const assetKeys = Object.keys(config.assets);
// console.log('Uploading', assetKeys.length, 'site assets...');
// assetKeys.forEach(asset => {
//   const body = config.assets[asset].load().wait();
//   hosting.callApi('putBlob', '/domain/public/web'+'/'+asset, body, body.mime).wait();
// });

const endTime = Date.now();
const elapsedSecs = Math.round((endTime - startTime) / 1000);
console.log('Blog published in', elapsedSecs, 'seconds :)');
