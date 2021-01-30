import { BlobEntry } from "https://uber.danopia.net/deno/dust@v1beta1/skylink/src/mod.ts";
import { AutomatonBuilder, Automaton, ApiHandle } from "https://uber.danopia.net/deno/dust@v1beta1/client-automaton/mod.ts";
import * as Base64 from 'https://deno.land/x/base64@v0.2.1/mod.ts';
import * as XmlEntities from 'https://deno.land/x/html_entities@v1.0/lib/xml-entities.js';

class UpdatePhotosRuntime {
  photos: ApiHandle;
  constructor(automaton: Automaton<UpdatePhotosRuntime>) {
    this.photos = automaton.getHandle(`/blog-data/photos`);
  }

  async runNow() {
    const startTime = Date.now();
    console.log('Grabbing photos...');

    const output = await this.photos.enumerateToLiteral({Depth: 3})
    if (output.Type !== 'Folder') throw new Error(`BUG`);

    for (const photo of output.Children) {
      if (photo.Type !== 'Folder') throw new Error(`BUG`);
      const photoPath = this.photos.subPath`/${photo.Name}`;

      const data: Record<string,string> = {};
      for (const child of photo.Children) {
        if (child.Type !== 'String') continue;
        data[child.Name.replace(/ [a-z]/g, x => x[1].toUpperCase())] = child.StringValue;
      }
      // console.log(photo.Name, data);

      if (!data.instagramUrl || data.fullResUrl) {
        if (!Deno.args.includes('--freshen')) continue;
      }

      console.log(`Fetching`, data.instagramUrl);
      const htmlBody = await fetch(data.instagramUrl).then(res => res.text());

      const hotlinkMatch = htmlBody.match(/<meta property="og:image" content="([^"]+)" \/>/);
      const linkingDataMatch = htmlBody.match(/<script type="application\/ld\+json">\n +({.+})\n +<\/script>/);
      const jsonMatch = htmlBody.match(/window\._sharedData = ([^\n]+);/);
      if (!hotlinkMatch || !linkingDataMatch || !jsonMatch) throw new Error(`TODO: regex failed`);

      const pageData = JSON.parse(jsonMatch[1]);
      const mediaData = pageData.entry_data.PostPage[0].graphql.shortcode_media;
      // console.log(JSON.stringify(mediaData, null, 2));

      const linkingData = JSON.parse(linkingDataMatch[1]);

      const commentCount = linkingData.commentCount || 0;
      const likeCount = linkingData.interactionStatistic.userInteractionCount || 0;
      const addlTexts = [ `${likeCount} like${likeCount!==1?'s':''}` ];

      const caption = XmlEntities.decode(linkingData.caption) as string;
      const takenAt = new Date(linkingData.uploadDate + 'Z');
      const takenMonth = takenAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      let altText = `Photo posted on ${takenMonth}`;

      const thumbnail = preview_to_jpeg_url(mediaData.media_preview);

      if (commentCount > 0) {
        const commentText = `${commentCount} comment${commentCount!==1?'s':''}`;
        addlTexts.push(commentText);
        altText = `${altText}, plus ${commentText}`;
      }

      const fullCaption = [
        caption, '', `Posted ${takenMonth}`, addlTexts.join(', ')
      ].join('\n');

      if (data.caption !== fullCaption) await photoPath.subPath`/caption`.storeString(fullCaption);
      if (data.takenAt !== takenAt.toISOString()) await photoPath.subPath`/taken at`.storeString(takenAt.toISOString());
      if (data.alternative !== altText) await photoPath.subPath`/alternative`.storeString(altText);
      if (data.fullResUrl !== hotlinkMatch[1]) await photoPath.subPath`/full res url`.storeString(hotlinkMatch[1]);
      if (data.caption !== fullCaption) await photoPath.subPath`/caption`.storeString(fullCaption);
      if (!data.thumbnail && thumbnail) await photoPath.subPath`/thumbnail`.storeLiteral(thumbnail);
    }

    const endTime = Date.now();
    const elapsedSecs = Math.round((endTime - startTime) / 1000);
    console.log('Updated instagram photos in', elapsedSecs, 'seconds :)');
  }
}

// based on https://stackoverflow.com/questions/49625771/how-to-recreate-the-preview-from-instagrams-media-preview-raw-data/49791447#49791447
const jpegtpl = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsaGikdKUEmJkFCLy8vQkc/Pj4/R0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0cBHSkpNCY0PygoP0c/NT9HR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR//AABEIABQAKgMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AA==";
function preview_to_jpeg_url(inputString: string) {
  if (!inputString) return null;
	const dynamic = Base64.toUint8Array(inputString);
	const payload = dynamic.subarray(3);
	const template = Base64.toUint8Array(jpegtpl);
	template[162] = dynamic[1];
  template[160] = dynamic[2];
  var final = new Uint8Array(template.length + payload.length);
  final.set(template);
  final.set(payload, template.length);
  return new BlobEntry('thumbnail', Base64.fromUint8Array(final), 'image/jpeg');
};

new AutomatonBuilder<UpdatePhotosRuntime>()
  .withMount('/blog-data', 'session:/persist/blog')
  .withRuntimeConstructor(UpdatePhotosRuntime)
  .launch();
