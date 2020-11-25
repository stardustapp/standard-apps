import { BlobEntry, Entry, FolderEntry } from "/home/dan/Code/@stardustapp/dust-typescript/skylink/src/mod.ts";
import { AutomatonBuilder, Automaton, ApiHandle } from "https://uber.danopia.net/deno/dust@v1beta1/client-automaton/mod.ts";
import { Marked } from "https://deno.land/x/markdown@v2.0.0/mod.ts";
import Mustache from 'https://deno.land/x/mustache@v0.2.1/mustache.mjs';
import * as Base64 from 'https://deno.land/x/base64@v0.2.1/mod.ts';
import {Sha256} from "https://deno.land/std@0.78.0/hash/sha256.ts";

import { ServiceAccount } from "https://danopia.net/deno/google-service-account@v1.ts";
import * as Gzip from "https://github.com/manyuanrong/wasm_gzip/raw/master/mod.ts";

type SiteFile = {path: string, body: Uint8Array, mime?: string};
async function publishFirebaseSite(siteId: string, credentialPath: string, files: Iterable<SiteFile>) {
  const credential = await ServiceAccount.readFromFile(credentialPath);
  const token = await credential.issueToken("https://www.googleapis.com/auth/firebase");

  const {name, status} = await fetch(
    'https://firebasehosting.googleapis.com/v1beta1/sites/'+siteId+'/versions', {
      method: 'POST',
      body: JSON.stringify({
        // "config": {
        //   "headers": [{
        //     "glob": "**",
        //     "headers": {
        //       "Cache-Control": "max-age=1800"
        //     }
        //   }]
        // }
      }),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
    }).then(x => x.json()) as {name: string; status: string};
  console.log('Firebase release', name, 'is', status);

  const fileHashes: Record<string,string> = Object.create(null);
  const hashMap = new Map<string,SiteFile&{compressed: Uint8Array}>();
  for (const file of files) {
    const compressed = Gzip.gzipEncode(file.body);
    const hash = new Sha256().update(compressed).hex();
    hashMap.set(hash, {...file, compressed});
    fileHashes[file.path] = hash;
  }

  let {uploadRequiredHashes, uploadUrl} = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/${name}:populateFiles`, {
      method: 'POST',
      body: JSON.stringify({
        files: fileHashes,
      }),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
    }).then(x => x.json()) as {uploadRequiredHashes: string[], uploadUrl: string};
  uploadRequiredHashes = uploadRequiredHashes ?? [];
  console.log('Firebase wants', uploadRequiredHashes.length, 'files out of', hashMap.size);

  for (const requiredHash of uploadRequiredHashes) {
    const file = hashMap.get(requiredHash);
    if (!file) throw new Error(`BUG: firebase wanted hash ${requiredHash} which we didn't offer`);

    const resp = await fetch(uploadUrl+'/'+requiredHash, {
      method: 'POST',
      body: file.compressed,
      headers: {
        'content-type': /*file.mime ??*/ 'application/octet-stream',
        authorization: `Bearer ${token.access_token}`,
      },
    });
    if (resp.status !== 200) throw new Error(`Firebase file upload returned ${resp.status}`);
    const compRatio = (file.body.length - file.compressed.length) / file.body.length;
    console.log('Uploaded', file.path, '-', Math.round(compRatio * 100), '% compression');
  }

  const release = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/${name}?update_mask=status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'FINALIZED',
      }),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
    }).then(x => x.json());
  console.log('Completed Firebase release:', release);

  const deploy = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/releases?${new URLSearchParams([['versionName', name]])}`, {
      method: 'POST',
      // body: JSON.stringify({
      //   status: 'FINALIZED',
      // }),
      headers: {
        // 'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
    }).then(x => x.json());
  console.log('Completed Firebase deploy:', deploy);
}

// await publishFirebaseSite('blog-bbudj4be', 'devmodecloud-7eb533117d28.json', [
//   {path: 'index.html', body: new TextEncoder().encode('hello world')},
// ]);
// Deno.exit(61);

const renderMustache = Mustache.render as unknown as (template: string, view: unknown) => string;

interface ContentNode {
  path: string;
  title: string;
  section: Record<string, string> | undefined;
  publishedAt: Date | null;
  innerHtml: string;
  raw: BlobEntry[];

  publishDate?: string;
  isOutdated?: boolean;
  baseHref?: string;
}

class PublishBlogRuntime {
  config: ApiHandle;
  data: ApiHandle;
  constructor(automaton: Automaton<PublishBlogRuntime>) {
    this.config = automaton.getHandle(`/blog-config`);
    this.data = automaton.getHandle(`/blog-data`);
  }

  async runNow() {
    const startTime = Date.now();

    console.log('Loading blog configuration...');
    const config = await getChildrenOf(this.config.subPath`/prefs`, 3);
    const prefs = readStructure(config);

    const siteTitle = prefs.siteTitle || 'New Blog';
    const siteSubtitle = prefs.siteSubtitle || 'Content goes here';
    const sections = readMap((config.find(x => x.Name === 'sections') as FolderEntry).Children, readStructure);
    // console.log(siteTitle, siteSubtitle, sections);

    // load all the asset & layout files into a Map
    const assetsRaw = await getChildrenOf(this.data.subPath`/assets`, 2);
    const assets = readMap(assetsRaw, x => x.find(y => y.Name === 'data') as BlobEntry);

    console.log('Loading pages and posts...');

    function renderInnerHtml(blobs: BlobEntry[]) {
      const htmlBlob = blobs.find(x => x.Name === 'html');
      const markdownBlob = blobs.find(x => x.Name === 'markdown');
      if (htmlBlob) {
        return new TextDecoder('utf-8').decode(htmlBlob.asBytes());
      } else if (markdownBlob) {
        return Marked.parse('# hi').content;
      }
      throw new Error("No innerHtml for content");
    }

    async function loadContentNodes(path: ApiHandle): Promise<ContentNode[]> {
      const nodesRaw = await getChildrenOf(path, 3);
      // console.log(nodesRaw);
      return nodesRaw.map(raw => {
        if (raw.Type !== 'Folder') throw new Error(`BUG`);
        const data = readStructure(raw.Children);
        const blobs = raw.Children.flatMap(x => x.Type === 'Blob' ? [x] : []);
        return {
          path: `${raw.Name}.html`,
          title: data.title || raw.Name,
          section: sections.get(data.section),
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
          innerHtml: renderInnerHtml(blobs),
          raw: blobs,
        };
      }).sort((a, b) => {
        if (!a.publishedAt) return 1;
        if (!b.publishedAt) return -1;
        return b.publishedAt.valueOf() - a.publishedAt.valueOf();
      });
    }
    const pages = await loadContentNodes(this.data.subPath`/pages`);
    const posts = await loadContentNodes(this.data.subPath`/posts`);
    // console.log(pages, posts);

    const photosPath = this.data.subPath`/photos`;
    const photos = (await getChildrenOf(photosPath, 3)).map(raw => {
      if (raw.Type !== 'Folder') throw new Error(`BUG`);
      return {_id: raw.Name, ...readStructure(raw.Children)};
    });

    const outdatedCutoff = new Date().getUTCFullYear() - 5;
    const months = [
      'January', 'Febuary', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    // const dateFormat = new Intl.DateTimeFormat('en-US', {dateStyle: "long"});
    posts.forEach(p => {
      if (p.publishedAt) {
        const publishedYear = p.publishedAt.getUTCFullYear();
        p.publishDate = `${months[p.publishedAt.getUTCMonth()]} ${p.publishedAt.getUTCDate()}, ${publishedYear}`;
        // publishedAt.format('LL [at] LT');
        p.isOutdated = publishedYear < outdatedCutoff;
        p.path = `posts/${publishedYear}/${p.path}`;
      } else {
        p.path = `posts/drafts/${p.path}`;
      }
    });
    // posts.sort(function (a, b) {
    //   return (b.publishedAt||'').localeCompare(a.publishedAt||'');
    // });
    const publishedPosts = posts.filter(x => x.publishedAt);

    console.log('Generating blog files...');

    // helper to pass a data object though one layout, then the site layout
    // special page? don't pass a layout, pass html as data.innerHtml instead
    function renderPage(data: {innerHtml?: string; baseHref?: string} | Record<string,unknown>, layoutName: string) {
      var {innerHtml, baseHref} = data;
      const layoutBlob = assets.get(`/_layouts/${layoutName}.html`);
      if (layoutBlob) {
        const layoutText = new TextDecoder('utf-8').decode(layoutBlob.asBytes());
        innerHtml = renderMustache(layoutText, data);
      }
      if (!innerHtml) throw new Error("No innerHtml for content");

      const defaultBlob = assets.get(`/_layouts/${'default'}.html`);
      if (!defaultBlob) throw new Error(
        `Layout 'default' not found`);
      const defaultText = new TextDecoder('utf-8').decode(defaultBlob.asBytes());

      const pageBody = renderMustache(defaultText, {
        siteTitle, siteSubtitle,
        pages, posts, photos,
        innerHtml, baseHref,
      }).replace(/&#x2F;/g, '/')
        .replace(/&#x3D;/g, '=');
      return new TextEncoder().encode(pageBody);
    }

    function reversePath(path: string) {
      if (path.includes('/')) {
        return path.split('/').slice(1).map(x => '..').join('/');
      } else {
        return '.';
      }
    }

    const htmlFiles = new Array<SiteFile>();
    function renderContentNodes(list: ContentNode[], layout: string) {
      list.forEach(content => {
        content.baseHref = reversePath(content.path);
        htmlFiles.push({
          path: '/'+content.path,
          body: renderPage(content, layout),
        });
      });
    }
    renderContentNodes(pages, 'page');
    renderContentNodes(posts, 'post');

    const yearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    htmlFiles.push({
      path: '/index.html',
      body: renderPage({
        pages, photos,
        recentPosts: publishedPosts
          .slice(0, 5)
          .filter(x => x.publishedAt && x.publishedAt.valueOf() > yearAgo),
      }, 'home'),
    });

    const newestYear = publishedPosts[0].publishedAt?.getUTCFullYear() ?? 2020;
    const oldestYear = publishedPosts.slice(-1)[0].publishedAt?.getUTCFullYear() ?? 2020;
    const postTimes = [];
    for (let year = newestYear; year >= oldestYear; year--) {
      for (let month = 11; month >= 0; month--) {
        const posts = publishedPosts.filter(x =>
          x.publishedAt?.getUTCFullYear() === year &&
          x.publishedAt?.getUTCMonth() === month);
        if (posts.length === 0) continue;

        const timeStr = `${months[month]} ${year}`;
        postTimes.push({ year, month, timeStr, posts });
      }
    }

    htmlFiles.push({
      path: '/posts/archive.html',
      body: renderPage({
        baseHref: '..',
        postTimes,
      }, 'archive'),
    });

    for (const [path, asset] of assets.entries()) {
      if (path.startsWith('/_layouts/')) continue;
      htmlFiles.push({
        path, body: asset.asBytes(),
      });
    }

    // console.log(htmlFiles);
    console.log('Uploading', htmlFiles.length, 'files to web hosting...');

    await publishFirebaseSite('blog-bbudj4be', 'devmodecloud-7eb533117d28.json', htmlFiles);

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

  }
}


async function getChildrenOf(path: ApiHandle, depth: number) {
  const output = await path.enumerateToLiteral({Depth: depth});
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

new AutomatonBuilder<PublishBlogRuntime>()
  .withMount('/blog-config', 'session:/config/blog')
  .withMount('/blog-data', 'session:/persist/blog')
  .withRuntimeConstructor(PublishBlogRuntime)
  .launch();
