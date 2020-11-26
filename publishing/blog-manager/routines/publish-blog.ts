import { BlobEntry, Entry, FolderEntry } from "https://uber.danopia.net/deno/dust@v1beta1/skylink/src/mod.ts";
import { AutomatonBuilder, Automaton, ApiHandle } from "https://uber.danopia.net/deno/dust@v1beta1/client-automaton/mod.ts";

import { ServiceAccount } from "https://danopia.net/deno/google-service-account@v1.ts";
import { deployFirebaseSite } from "https://danopia.net/deno/firebase-hosting-deploy@v1.ts";

import { Marked } from "https://deno.land/x/markdown@v2.0.0/mod.ts";
import Mustache from 'https://deno.land/x/mustache@v0.2.1/mustache.mjs';

type SiteFile = {path: string, body: Uint8Array};
async function publishFirebaseSite(siteId: string, credentialPath: string, files: Iterable<SiteFile>) {
  const credential = await ServiceAccount.readFromFile(credentialPath);
  const token = await credential.issueToken("https://www.googleapis.com/auth/firebase");
  const release = await deployFirebaseSite(siteId, token.access_token, files);
  return release.name;
}

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
        const markdownText = new TextDecoder('utf-8').decode(markdownBlob.asBytes());
        return Marked.parse(markdownText).content;
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
    htmlFiles.push({
      path: '/healthz',
      body: new TextEncoder().encode('ok'),
    });

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
