// This is a DataTree schema
// For more info, visit https://www.npmjs.com/package/@dustjs/data-tree

export const metadata = {
  AppName: 'Personal Blog',
  Author: 'Daniel Lamando',
  Audience: 'Users',
  License: 'MIT',
};
export function builder(El, addRoot) {

  addRoot(new El.AppRegion('config', {
    '/prefs': new El.Document({
      '/site title': String,
      '/site subtitle': String,

      '/sections': new El.StringMap({
        '/tag text': String,
      }),
    }),

    '/hosting': new El.Document({
      '/type': String,
      '/domain name': String,
      '/gtag property': String,
    }),

  }));

  addRoot(new El.AppRegion('persist', {

    '/assets': new El.NamedCollection({
      '/cache enabled': Boolean,
      '/cache seconds': Number,
      '/data': new El.Blob(),
      // text/x-handlebars; charset=utf-8; target=text/html
    }),

    '/pages': new El.NamedCollection({
      '/title': String,
      '/markdown': new El.Blob('text/markdown', 'utf-8'),
      '/html': new El.Blob('text/html', 'utf-8'),
    }),

    '/photos': new El.NamedCollection({
      '/alternative': String,
      '/caption': String,
      '/full res url': String,
      '/instagram url': String,
      '/preview url': String,
      '/thumbnail': new El.Blob('image/jpeg'),
      '/taken at': Date,
    }),

    '/posts': new El.NamedCollection({
      '/title': String,
      '/section': String,
      '/markdown': new El.Blob('text/markdown', 'utf-8'),
      '/html': new El.Blob('text/html', 'utf-8'),
      '/published at': Date,
    }),

  }));

}
