# MMM-RandomPhoto

This a module for the [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror). It will show a (random) photo from any of these sources:

- [picsum.photos](https://picsum.photos)
- a share of any [nextcloud](https://nextcloud.com/) instance
- a local directory on the Raspberry Pi

## Installation

1. Navigate into your MagicMirror's `modules` folder and execute:

```bash
git clone https://github.com/skuethe/MMM-RandomPhoto.git && cd MMM-RandomPhoto
```

2. Install the node dependencies:

```bash
npm install
```

## Config

The entry in `config.js` can include the following options:

| Option                | Description
|-----------------------|------------
| `imageRepository`     | *Optional* - The image source.<br><br>**Type:** `string`<br>**Allowed:** `picsum`, `nextcloud`, `localdirectory`<br>**Default:** `picsum`
| `repositoryConfig`    | *Optional* - The configuration block for the selected image repository. See below.<br><br>**Type:** `Object`
| `random`              | *Optional* - Should the images be shown at random? Has **NO** effect when `imageRepository` is set to `picsum`, as it is forced there.<br><br>**Type:** `boolean`<br>**Default:** `true`
| `width`               | *Optional* - The width of the image in px. Only used when `imageRepository` is set to `picsum`<br><br>**Type:** `int`<br>**Default:** `1920`
| `height`              | *Optional* - The height of the image in px. Only used when `imageRepository` is set to `picsum`<br><br>**Type:** `int`<br>**Default:** `1080`
| `grayscale`           | *Optional* - Should the image be grayscaled? <br><br>**Type:** `boolean`<br>**Default:** `false`
| `blur`                | *Optional* - Should the image be blurred? <br><br>**Type:** `boolean`<br>**Default:** `false`
| `blurAmount`          | *Optional* - If you want to blur it, how much?<br><br>**Type:** `int`<br>**Allowed:** minimum: `0`, maximum: `10`<br>Default `1`
| `opacity`             | *Optional* - The opacity of the image.<br><br>**Type:** `double`<br>**Default:** `0.3`
| `animationSpeed`      | *Optional* - How long the fade out and fade in of photos should take.<br><br>**Type:** `int`<br>**Default:** `500`
| `updateInterval`      | *Optional* - How long before getting a new image.<br><br>**Type:** `int`<br>**Default:** `60` seconds
| `startHidden`         | *Optional* - Should the module start hidden? Useful if you use it as a "screensaver"<br><br>**Type:** `boolean`<br>**Default:** `false`
| `startPaused`         | *Optional* - Should the module start in "paused" (automatic image loading will be paused) mode?<br><br>**Type:** `boolean`<br>**Default:** `false`
| `showStatusIcon`      | *Optional* - Do you want to see the current status of automatic image loading ("play" / "paused" mode)?<br><br>**Type:** `boolean`<br>**Default:** `true`
| `statusIconMode`      | *Optional* - Do you want to display the icon all the time or just fade in and out on status change?<br><br>**Type:** `string`<br>**Allowed:** `show` or `fade`<br>**Default:** `show`
| `statusIconPosition`  | *Optional* - Where do you want to display the status icon?<br><br>**Type:** `string`<br>**Allowed:** `top_right`, `top_left`, `bottom_right` or `bottom_left`<br>**Default:** `top_right`
| `imageFit`            | *Optional* - How should the image be fitted within the display area?<br><br>**Type:** `string`<br>**Allowed:** `cover` (fills container, may crop), `contain` (fits entire image), `fill` (stretches to fill)**Default:** `cover`
| `showMetadata`        | *Optional* - Show image metadata (date taken, location) extracted from EXIF data<br><br>**Type:** `boolean`<br>**Default:** `true`
| `metadataPosition`    | *Optional* - Where to display the metadata information<br><br>**Type:** `string`<br>**Allowed:** `bottom_left`, `bottom_right`, `top_left`, `top_right`<br>**Default:** `bottom_left`
| `metadataMode`        | *Optional* - How to display the metadata<br><br>**Type:** `string`<br>**Allowed:** `show` (always visible), `fade` (fade in/out on image change), `hide` (hidden)<br>**Default:** `show`
| `metadataCacheSize`   | *Optional* - Number of metadata entries to cache for performance optimization<br><br>**Type:** `int`<br>**Default:** `100`

Options for `repositoryConfig` - [more information](https://github.com/skuethe/MMM-RandomPhoto/blob/master/MMM-RandomPhoto.js#L18-L24):

| Option                | Description
|-----------------------|------------
| `path`                | *Required for nextcloud and localdirectory* - Path / URL to fetch images from.<br>- if `imageRepository` is set to `picsum` it is **ignored**<br>- if `imageRepository` is set to `nextcloud` it has to point to your nextcloud instance's specific share path<br>- if `imageRepository` is set to `localdirectory` it has to point to a local Path<br><br>**Type:** `string`<br>**Default:** `https://picsum.photos/`
| `username`            | *Required for nextcloud with basic auth* - The username if images require basic authentication.<br><br>**Type:** `string`<br>**Default:** ``
| `password`            | *Required for nextcloud with basic auth* - The password if images require basic authentication.<br><br>**Type:** `string`<br>**Default:** ``
| `recursive`           | *Optional for localdirectory* - Search recursive for images in path.<br><br>**Type:** `boolean`<br>**Default:** `false`
| `exclude`           | *Optional for localdirectory* - Exclude matching regex files.<br><br>**Type:** `list`<br>**Default:** `[]`

Here are some examples for entries in `config.js`

**picsum**:

```js
{
    module: 'MMM-RandomPhoto',
    position: 'fullscreen_below',
    config: {
        imageRepository: "picsum",
        repositoryConfig: {
        },
        width: 1920,
        height: 1080,
        grayscale: true,
        startHidden: true,
        showStatusIcon: true,
        statusIconMode: "show",
        statusIconPosition: "top_right",
        imageFit: "cover",
    }
},
```

**NextCloud**:

*Hint*: [Create a "device secret"](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices) for accessing a share behind basic authentication.

```js
{
    module: 'MMM-RandomPhoto',
    position: 'fullscreen_below',
    config: {
        imageRepository: "nextcloud",
        repositoryConfig: {
            path: "https://YOUR.NEXTCLOUD.HOST/remote.php/dav/files/USERNAME/PATH/TO/DIRECTORY/",
            username: "USERNAME",
            password: "YOURDEVICESECRET",
        },
        grayscale: true,
        startPaused: true,
        showStatusIcon: true,
    }
},
```

**local directory with metadata**:

```js
{
    module: 'MMM-RandomPhoto',
    position: 'fullscreen_below',
    config: {
        imageRepository: "localdirectory",
        repositoryConfig: {
            path: "/home/USER/pictures/background/",
            recursive: true,
            exclude: ["tmp", "#recycle"],
        },
        showMetadata: true,
        metadataPosition: "bottom_left",
        metadataMode: "fade",
        metadataCacheSize: 150,
    }
},
```

## Metadata Features

The module can extract and display metadata from your images, including:

- **Date/Time Taken**: Extracted from EXIF data (DateTimeOriginal, DateTime, or CreateDate)
- **Location**: Converted from GPS coordinates in EXIF data to readable location names

### Performance Optimizations

- **Smart Caching**: Metadata is cached to avoid repeated EXIF processing
- **Lazy Loading**: Metadata is only extracted when an image is displayed
- **Location Caching**: Reverse geocoding results are cached to minimize API calls
- **Hardware Acceleration**: CSS transforms use GPU acceleration for smooth animations

### Metadata Display Modes

- `show`: Always visible while image is displayed
- `fade`: Appears for 5 seconds then fades out
- `hide`: Metadata extraction still occurs but display is hidden

### Location Services

The module uses OpenStreetMap's Nominatim service for reverse geocoding (converting GPS coordinates to readable locations). This is:
- Free to use
- Respects rate limiting
- Falls back to coordinates if service is unavailable

## Notifications

You can control this module by sending specific notifications.
See the following list:

| Option                | Description
|-----------------------|------------
| `RANDOMPHOTO_NEXT`    | Don't wait for `updateInterval` to trigger and immidiately show the next image<br>Respects the current state of automatic image loading
| `RANDOMPHOTO_PREVIOUS`| Show the previous image.<br>Only works if `config.random` is set to `false` and `imageRepository` is **NOT** set to `picsum`
| `RANDOMPHOTO_TOGGLE`  | Toggle the state of automatic image loading ("play" / "pause" mode)
| `RANDOMPHOTO_PAUSE`   | Pause the loading of new images
| `RANDOMPHOTO_RESUME`  | Resume the loading of new images

## Ideas

Thinking about implementing the following things:

- possibility to show the EXIF comment from each image on screen (target selectable)
- ...

## Dependencies

- [jQuery](https://www.npmjs.com/package/jquery) (installed via `npm install`)

## Special Thanks

- [Michael Teeuw](https://github.com/MichMich) for creating the awesome [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) project that made this module possible.
- [Diego Vieira](https://github.com/diego-vieira) for [initially](https://github.com/diego-vieira/MMM-RandomPhoto) creating this module.
