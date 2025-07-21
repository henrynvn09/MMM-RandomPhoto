require("url"); // for nextcloud
const https = require("node:https"); // for nextcloud
const fs = require("fs"); // for localdirectory
const Log = require("logger");
const { exifr } = require("exifr"); // for EXIF data extraction

const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({

    start: function() {
        var self = this;

        this.nextcloud = false;
        this.localdirectory = false;
        this.metadataCache = new Map(); // Cache for EXIF metadata
        this.locationCache = new Map(); // Cache for reverse geocoding

        this.imageList = [];
        this.expressApp.get("/" + this.name + "/images/:randomImageName", async function(request, response) {
            var imageBase64Encoded = await self.fetchEncodedImage(decodeURIComponent(request.params.randomImageName));
            response.send(imageBase64Encoded);
        });
    },


    socketNotificationReceived: function(notification, payload) {
        //console.log("["+ this.name + "] received a '" + notification + "' with payload: " + payload);
        if (notification === "SET_CONFIG") {
            this.config = payload;
            if (this.config.imageRepository === "nextcloud") {
                this.nextcloud = true;
            } else if (this.config.imageRepository === "localdirectory") {
                this.localdirectory = true;
            }
        }
        if (notification === "FETCH_IMAGE_LIST") {
            if (this.config.imageRepository === "nextcloud") {
                this.fetchNextcloudImageList();
            }
            if (this.config.imageRepository === "localdirectory") {
                this.fetchLocalImageList();
            }
        }
        if (notification === "FETCH_IMAGE_METADATA") {
            this.extractImageMetadata(payload);
        }
    },

    fetchLocalImageDirectory: function(path) {
        var self = this;

        // Validate path
        if (!fs.existsSync(path)) {
            console.log("["+ self.name + "] ERROR - specified path does not exist: " + path);
            return false;
        }

	    const excludePattern = self.config.repositoryConfig.exclude?.map(pattern => new RegExp(pattern));

        var fileList = fs.readdirSync(path, { withFileTypes: true });
        if (fileList.length > 0) {
            for (var f = 0; f < fileList.length; f++) {
		        if (excludePattern?.some(regex => regex.test(fileList[f].name))) continue;

                if (fileList[f].isFile()) {
                    //TODO: add mime type check here
                    self.imageList.push(encodeURIComponent(path + "/" + fileList[f].name));
                }
                if ((self.config.repositoryConfig.recursive === true) && fileList[f].isDirectory()) {
                    self.fetchLocalImageDirectory(path + "/" + fileList[f].name);
                }
            }
            return;
        }
    },

    fetchLocalImageList: function() {
        var self = this;
        var path = self.config.repositoryConfig.path;

        self.imageList = [];
    	self.fetchLocalImageDirectory(path);

        self.sendSocketNotification("IMAGE_LIST", self.imageList);
        return false;
    },


    fetchNextcloudImageList: function() {
        var self = this;
        var imageList = [];
        var path = self.config.repositoryConfig.path;

        const urlParts = new URL(path);
        const requestOptions = {
            method: "PROPFIND",
            headers: {
                "Authorization": "Basic " + new Buffer.from(this.config.repositoryConfig.username + ":" + this.config.repositoryConfig.password).toString("base64")
            }
        };
        https.get(path, requestOptions, function(response) {
            var body = "";
            response.on("data", function(data) {
                body += data;
            });
            response.on("end", function() {
                imageList = body.match(/href>\/[^<]+/g);
                imageList.shift(); // delete first array entry, because it contains the link to the current folder
                if (imageList && imageList.length > 0) {
                    imageList.forEach(function(item, index) {
                        // remove clutter and the pathing from the entry -> only save file name
                        imageList[index] = encodeURIComponent(item.replace("href>" + urlParts.pathname, ""));
                        //console.log("[" + self.name + "] Found entry: " + imageList[index]);
                    });
                    self.sendSocketNotification("IMAGE_LIST", imageList);
                    return;
                } else {
                    console.log("[" + this.name + "] WARNING: did not get any images from nextcloud url");
                    return false;
                }
            });
        })
        .on("error", function(err) {
            console.log("[" + this.name + "] ERROR: " + err);
            return false;
        });
    },


    fetchEncodedImage: async function(passedImageName) {
        var self = this;
        return new Promise(function(resolve, reject) {
            var fullImagePath = passedImageName;

            // Local files
            if (self.localdirectory) {
                var fileEncoded = "data:image/jpeg;base64," + fs.readFileSync(fullImagePath, { encoding: 'base64' });
                resolve(fileEncoded);
            }

            // Nextcloud
            else if (self.nextcloud) {
                const requestOptions = {
                    method: "GET",
                    headers: {
                        "Authorization": "Basic " + new Buffer.from(self.config.repositoryConfig.username + ":" + self.config.repositoryConfig.password).toString("base64")
                    }
                };
                https.get(self.config.repositoryConfig.path + fullImagePath, requestOptions, (response) => {
                    response.setEncoding('base64');
                    var fileEncoded = "data:" + response.headers["content-type"] + ";base64,";
                    response.on("data", (data) => { fileEncoded += data; });
                    response.on("end", () => {
                        resolve(fileEncoded);
                    });
                })
                .on("error", function(err) {
                    console.log("[" + this.name + "] ERROR: " + err);
                    return false;
                });
            }
        })


        /**
        var getMimeObject = spawn("file", ["-b", "--mime-type", "-0", "-0", file]);
        getMimeObject.stdout.on('data', (data) => {
            var mimeType = data.toString().replace("\0", "");
            //console.log("mime type is: '" + mimeType + "'");
            var fileEncoded = "data:" + mimeType + ";base64,";
            fileEncoded += fs.readFileSync(file, { encoding: 'base64' });
            //console.log("base64:");
            console.log("<img src='" + fileEncoded + "' />");
            //return fileEncoded;
        });
        **/
    },

    extractImageMetadata: async function(imagePath) {
        var self = this;
        
        console.log("[MMM-RandomPhoto] Node helper extracting metadata for:", imagePath);
        
        try {
            // Check cache first for performance
            if (self.metadataCache.has(imagePath)) {
                Log.log("[" + self.name + "] Using cached metadata for: " + imagePath);
                self.sendSocketNotification("IMAGE_METADATA", {
                    imagePath: imagePath,
                    metadata: self.metadataCache.get(imagePath)
                });
                return;
            }

            var decodedPath = decodeURIComponent(imagePath);
            var metadata = {
                dateTime: null,
                location: null,
                coordinates: null
            };

            // Only extract from local files (nextcloud images would need different handling)
            if (self.localdirectory && fs.existsSync(decodedPath)) {
                Log.log("[" + self.name + "] Extracting EXIF data from: " + decodedPath);
                
                // Extract EXIF data using exifr
                const exifData = await exifr.parse(decodedPath, {
                    tiff: true,
                    xmp: true,
                    icc: false,
                    jfif: false,
                    ihdr: false,
                    iptc: false,
                    pick: ['DateTimeOriginal', 'DateTime', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef']
                });

                if (exifData) {
                    // Extract date/time
                    metadata.dateTime = exifData.DateTimeOriginal || exifData.DateTime || exifData.CreateDate;
                    
                    // Extract GPS coordinates
                    if (exifData.GPSLatitude && exifData.GPSLongitude) {
                        var lat = exifData.GPSLatitude;
                        var lng = exifData.GPSLongitude;
                        
                        // Handle GPS reference (N/S, E/W)
                        if (exifData.GPSLatitudeRef === 'S') lat = -lat;
                        if (exifData.GPSLongitudeRef === 'W') lng = -lng;
                        
                        metadata.coordinates = { lat: lat, lng: lng };
                        
                        // Get location name from coordinates
                        metadata.location = await self.reverseGeocode(lat, lng);
                    }
                    
                    Log.log("[" + self.name + "] Extracted metadata:", metadata);
                } else {
                    Log.log("[" + self.name + "] No EXIF data found in image: " + decodedPath);
                }
            } else if (self.nextcloud) {
                // For nextcloud images, we can't easily extract EXIF without downloading
                // You could implement this by downloading the image temporarily
                Log.log("[" + self.name + "] Nextcloud metadata extraction not implemented yet");
            }

            // Cache the metadata (even if empty) to avoid repeated processing
            self.cacheMetadata(imagePath, metadata);
            
            // Send the metadata back to the module
            self.sendSocketNotification("IMAGE_METADATA", {
                imagePath: imagePath,
                metadata: metadata
            });

        } catch (error) {
            Log.error("[" + self.name + "] Error extracting metadata: " + error.message);
            // Send empty metadata to prevent hanging
            self.sendSocketNotification("IMAGE_METADATA", {
                imagePath: imagePath,
                metadata: { dateTime: null, location: null, coordinates: null }
            });
        }
    },

    reverseGeocode: async function(lat, lng) {
        var self = this;
        
        try {
            // Create a cache key for this coordinate (rounded to reduce cache size)
            var cacheKey = Math.round(lat * 1000) + "," + Math.round(lng * 1000);
            
            // Check location cache first
            if (self.locationCache.has(cacheKey)) {
                return self.locationCache.get(cacheKey);
            }

            // Use a free geocoding service (OpenStreetMap Nominatim)
            // Note: Be respectful with rate limiting
            const https = require("https");
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
            
            return new Promise((resolve, reject) => {
                const request = https.get(url, {
                    headers: {
                        'User-Agent': 'MMM-RandomPhoto/1.0 (MagicMirror Module)'
                    }
                }, (response) => {
                    let data = '';
                    
                    response.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    response.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            var location = null;
                            
                            if (result && result.address) {
                                // Build a nice location string
                                var parts = [];
                                if (result.address.city) parts.push(result.address.city);
                                else if (result.address.town) parts.push(result.address.town);
                                else if (result.address.village) parts.push(result.address.village);
                                
                                if (result.address.state) parts.push(result.address.state);
                                if (result.address.country) parts.push(result.address.country);
                                
                                location = parts.join(', ');
                            }
                            
                            if (!location) {
                                location = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                            }
                            
                            // Cache the result
                            self.cacheLocation(cacheKey, location);
                            resolve(location);
                            
                        } catch (parseError) {
                            Log.error("[" + self.name + "] Error parsing geocoding response: " + parseError.message);
                            resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                        }
                    });
                });
                
                request.on('error', (error) => {
                    Log.error("[" + self.name + "] Error reverse geocoding: " + error.message);
                    resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                });
                
                // Set timeout to prevent hanging
                request.setTimeout(5000, () => {
                    request.destroy();
                    resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                });
            });
            
        } catch (error) {
            Log.error("[" + self.name + "] Error in reverse geocoding: " + error.message);
            return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
    },

    cacheMetadata: function(imagePath, metadata) {
        var self = this;
        
        // Implement LRU cache to limit memory usage
        const maxCacheSize = self.config?.metadataCacheSize || 100;
        if (self.metadataCache.size >= maxCacheSize) {
            var firstKey = self.metadataCache.keys().next().value;
            self.metadataCache.delete(firstKey);
        }
        
        self.metadataCache.set(imagePath, metadata);
    },

    cacheLocation: function(cacheKey, location) {
        var self = this;
        
        // Keep location cache smaller since coordinates can be similar
        const maxLocationCacheSize = 50;
        if (self.locationCache.size >= maxLocationCacheSize) {
            var firstKey = self.locationCache.keys().next().value;
            self.locationCache.delete(firstKey);
        }
        
        self.locationCache.set(cacheKey, location);
    }


});
