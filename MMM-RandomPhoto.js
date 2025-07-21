/* global Module */

/* MagicMirror²
 * Module: MMM-RandomPhoto
 *
 * By Diego Vieira <diego@protos.inf.br>
 * and skuethe
 * ICS Licensed.
 */

Module.register("MMM-RandomPhoto",{
    defaults: {
        opacity: 0.3,
        animationSpeed: 500,
        updateInterval: 60,
        imageRepository: "picsum", // Select the image repository source. One of "picsum" (default / fallback), "localdirectory" or "nextcloud" (currently broken because of CORS bug in nextcloud)
        repositoryConfig: {
            // if imageRepository = "picsum" -> "path", "username" and "password" are ignored and can be left empty
            // if imageRepository = "nextcloud"
            //  -> "path" will point to your image directory URL, f.e.: "https://YOUR.NEXTCLOUD.HOST/remote.php/dav/files/USERNAME/PATH/TO/DIRECTORY/"
            //  -> if the share is private / internally shared only, add "username" and "password" for basic authentication. See documentation on how to create an "device" password:
            //     https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices
            // if imageRepository = "localdirectory"
            //  -> "path" will point to your local directory, f.e.: "~/someReallyCoolPictures", "username" and "password" are ignored
            path: "https://picsum.photos/",
            username: "",
            password: "",
            recursive: false,
            exclude: [],
        },
        width: 1920,
        height: 1080,
        random: true, // Show random images? Has no effect if you select "picsum" as imageRepository - there it is always random
        grayscale: false,
        blur: false,
        blurAmount: 1, // between 1 and 10
        startHidden: false, // helpful if you use it as a screensaver and only want to show it f.e. after a specific time or with a specific touch gesture
        startPaused: false, // start in "paused" mode -> automatic image loading is paused
        showStatusIcon: true,
        statusIconMode: "show", // one of: "show" (default / fallback) or "fade"
        statusIconPosition: "top_right", // one of: "top_right" (default / fallback), "top_left", "bottom_right" or "bottom_left"
        imageFit: "cover", // one of: "cover" (default - fills container, may crop), "contain" (fits entire image), "fill" (stretches to fill)
        showMetadata: true, // Show image metadata (date taken, location)
        metadataPosition: "bottom_left", // one of: "bottom_left" (default), "bottom_right", "top_left", "top_right"
        metadataMode: "show", // one of: "show" (always visible), "fade" (fade in/out on image change), "hide" (hidden)
        metadataCacheSize: 100, // Number of metadata entries to cache for performance
    },

    start: function() {
        this.updateTimer = null;
        this.imageList = null; // Used for nextcloud and localdirectory image list
        this.currentImageIndex = -1; // Used for nextcloud and localdirectory image list
        this.running = false;
        this.metadataCache = new Map(); // Cache for image metadata
        this.currentMetadata = null; // Current image metadata
        this.metadataTimeout = null; // Timeout for fade animations

        this.nextcloud = false;
        this.localdirectory = false;

        this.config.imageRepository = this.config.imageRepository.toLowerCase();
        if (this.config.imageRepository === "nextcloud") {
            this.nextcloud = true;
        } else if (this.config.imageRepository === "localdirectory") {
            this.localdirectory = true;
        }

        // Set blur amount to a max of 10px
        if(this.config.blurAmount > 10) { this.config.blurAmount = 10; }

        // Validate imageFit configuration
        var validImageFitOptions = ['cover', 'contain', 'fill'];
        if (validImageFitOptions.indexOf(this.config.imageFit) === -1) {
            this.config.imageFit = 'cover';
        }

        if (this.nextcloud || this.localdirectory) {
            this.sendSocketNotification('SET_CONFIG', this.config);
            this.fetchImageList();
        } else {
            // picsum -> force URL
            Log.log(this.name + " --- DEBUG ---: using picsum");
            this.config.repositoryConfig.path = "https://picsum.photos/";
            this.sendSocketNotification('SET_CONFIG', this.config);
        }
    },

    fetchImageList: function() {
        if (typeof this.config.repositoryConfig.path !== "undefined" && this.config.repositoryConfig.path !== null) {
            this.sendSocketNotification('FETCH_IMAGE_LIST');
        } else {
            Log.error("[" + this.name + "] Trying to use 'nextcloud' or 'localdirectory' but did not specify any 'config.repositoryConfig.path'.");
        }
    },

    pauseImageLoading: function() {
        clearTimeout(this.updateTimer);
        this.running = false;
        if (this.config.showStatusIcon) {
            this.loadIcon();
        }
    },

    resumeImageLoading: function(respectPausedState) {
        if (!this.running) {
            if (respectPausedState && this.config.startPaused) {
                this.running = false;
            } else {
                this.running = true;
            }
            this.load();
            if (this.config.showStatusIcon) {
                this.loadIcon();
            }
        }
    },

    load: function(mode="next") {
        var self = this;
        var url = "";

        if (self.localdirectory || self.nextcloud) {
            if (self.imageList && self.imageList.length > 0) {
                var originalImagePath = this.returnImageFromList(mode);
                url = "/" + this.name + "/images/" + originalImagePath;

                jQuery.ajax({
                    method: "GET",
                    url: url,
                })
                .done(function (data) {
                    self.smoothImageChange(data, originalImagePath);
                })
                .fail(function( jqXHR, textStatus ) {
                    Log.error("[" + self.name + "] Request failed: " + textStatus);
                    console.dir(jqXHR);
                    return false;
                });

            } else {
                Log.error("[" + self.name + "] No images to display. 'this.imageList': " + self.imageList);
                return false;
            }
        } else {
            // picsum default / fallback
            url = self.config.repositoryConfig.path + self.config.width + "/" + self.config.height + "/"
            if(self.config.grayscale) {
                url = url + (url.indexOf('?') > -1 ? '&' : '?') + "grayscale";
            }
            if(self.config.blur) {
                url = url + (url.indexOf('?') > -1 ? '&' : '?') + "blur";
                if(self.config.blurAmount > 1) {
                    if(self.config.blurAmount > 10) { self.config.blurAmount = 10; }
                    url = url + "=" + self.config.blurAmount;
                }
            }
            url = url + (url.indexOf('?') > -1 ? '&' : '?') + (new Date(Date.now()).getTime());
            self.smoothImageChange(url);
        }

        // Only activate re-loading itself, if we are not in "pause" state
        if (this.running) {
            this.updateTimer = setTimeout(function() {
                self.load();
            }, (this.config.updateInterval * 1000));
        }
    },

    smoothImageChange: function(url, imagePath = null) {
        var self = this;
        var img = $('<img />').attr('src', url);
        
        img.on('load', function() {
            $('#randomPhoto-placeholder1').attr('src', url).animate({
                opacity: self.config.opacity
            }, self.config.animationSpeed, function() {
                $(this).attr('id', 'randomPhoto-placeholder2');
            });

            $('#randomPhoto-placeholder2').animate({
                opacity: 0
            }, self.config.animationSpeed, function() {
                $(this).attr('id', 'randomPhoto-placeholder1');
            });
            
            // Handle metadata display
            if (self.config.showMetadata && (self.localdirectory || self.nextcloud)) {
                self.loadImageMetadata(imagePath || url);
            } else if (self.config.showMetadata) {
                // For picsum, hide metadata as it doesn't have real EXIF data
                self.hideMetadata();
            }
        });
    },

    returnImageFromList: function(mode) {
        var indexToFetch = this.currentImageIndex;
        const imageList = this.imageList;

        if (this.config.random) {
            //Log.info("[" + this.name + "] -- DEBUG -- will fetch a random image");
            do {
                indexToFetch = Math.floor(Math.random() * imageList.length);
            } while (imageList.length > 1 && indexToFetch === this.currentImageIndex);
        } else {
            if (mode === "previous") {
                indexToFetch--;
                if (indexToFetch < 0) {
                    indexToFetch = (imageList.length - 1);
                }
            } else {
                indexToFetch++;
                if (indexToFetch >= imageList.length) {
                    indexToFetch = 0;
                }
            }
        }
        var imageSource = imageList[indexToFetch];
        Log.info(indexToFetch, imageSource);
        this.currentImageIndex = indexToFetch;

        return imageSource;
    },

    loadIcon: function(navigate="none") {
        var self = this;
        const statusIcon = document.getElementById("randomPhotoStatusIcon");

        let currentIndex = -1;
        let iconloadInProgress = false;

        // Animation stuff
        const animationSteps = [];
        const animateToNextState = () => {
            requestAnimationFrame( () => {
                currentIndex++;
                if (currentIndex < animationSteps.length) {
                    animationSteps[currentIndex]();
                    //console.log("animateToNextState(): " + animationSteps[currentIndex].toString());
                }
            });
        };
        const cleanupAnimation = () => {
            statusIcon.style.animation = null;
            iconloadInProgress = false;
        }

        // MutationObserver to listen to class change events
        const attrObserver = new MutationObserver((mutations) => {
            mutations.forEach(mu => {
                if (mu.attributeName === "class" && iconloadInProgress) {
                    animateToNextState();
                }
            });
        });
        attrObserver.observe(statusIcon, { attributes: true });

        // Eventlistener to listen to animation end events
        statusIcon.addEventListener("animationend", () => {
            animateToNextState();
        });

        // Some helper strings for fontawsome icons
        var translateStatus = "";
        if (self.running) {
            translateStatus = "play"
        } else {
            translateStatus = "pause"
        }

        // If we used the "next" / "previous" notifications
        if (navigate != "none") {
            if (!statusIcon.classList.contains("rpihidden")) {
                animationSteps.push(
                    () => statusIcon.style.animation = "fadeOut 1s",
                );
            }
            animationSteps.push(
                () => statusIcon.className = "far fa-arrow-alt-circle-" + navigate + " rpihidden",
                () => statusIcon.style.animation = "fadeInAndOut 2s",
                () => statusIcon.className = "far fa-" + translateStatus + "-circle rpihidden",
            );
            if (self.config.statusIconMode != "fade") {
                animationSteps.push(
                    () => statusIcon.style.animation = "fadeIn 1s",
                    () => statusIcon.classList.remove("rpihidden"),
                );
            }
            animationSteps.push(
                () => cleanupAnimation()
            );
            iconloadInProgress = true;
            animateToNextState();
        } else {
            if (!statusIcon.classList.contains("rpihidden")) {
                animationSteps.push(
                    () => statusIcon.style.animation = "fadeOut 1s",
                );
            }
            animationSteps.push(
                () => statusIcon.className = "far fa-" + translateStatus + "-circle rpihidden",
                () => statusIcon.style.animation = "fadeIn 1s",
                () => statusIcon.classList.remove("rpihidden"),
            );
            if (self.config.statusIconMode === "fade") {
                animationSteps.push(
                    () => statusIcon.style.animation = "fadeOut 4s",
                    () => statusIcon.classList.add("rpihidden"),
                );
            }
            animationSteps.push(
                () => cleanupAnimation()
            );
            iconloadInProgress = true;
            animateToNextState();
        }
    },

    loadImageMetadata: function(imagePath) {
        var self = this;
        
        console.log("[MMM-RandomPhoto] Loading metadata for:", imagePath);
        
        // Check cache first for performance
        if (self.metadataCache.has(imagePath)) {
            console.log("[MMM-RandomPhoto] Using cached metadata");
            self.displayMetadata(self.metadataCache.get(imagePath));
            return;
        }
        
        // Request metadata from node_helper
        self.sendSocketNotification('FETCH_IMAGE_METADATA', imagePath);
    },
    
    displayMetadata: function(metadata) {
        var self = this;
        
        console.log("[MMM-RandomPhoto] Displaying metadata:", metadata);
        
        if (!self.config.showMetadata || self.config.metadataMode === "hide") {
            console.log("[MMM-RandomPhoto] Metadata display disabled in config");
            return;
        }
        
        var metadataElement = document.getElementById("randomPhotoMetadata");
        if (!metadataElement) {
            console.log("[MMM-RandomPhoto] Metadata element not found in DOM");
            return;
        }
        
        var content = "";
        var hasContent = false;
        
        if (metadata.dateTime) {
            content += '<div class="metadata-date">';
            content += '<i class="fas fa-calendar-alt metadata-icon"></i>';
            content += self.formatDate(metadata.dateTime);
            content += '</div>';
            hasContent = true;
        }
        
        if (metadata.location) {
            content += '<div class="metadata-location">';
            content += '<i class="fas fa-map-marker-alt metadata-icon"></i>';
            content += self.escapeHtml(metadata.location);
            content += '</div>';
            hasContent = true;
        }
        
        if (hasContent) {
            console.log("[MMM-RandomPhoto] Showing metadata with content:", content);
            // Performance optimization: use requestAnimationFrame for smooth animations
            requestAnimationFrame(function() {
                metadataElement.innerHTML = content;
                metadataElement.classList.remove("rpmhidden", "metadata-fade-out");
                metadataElement.classList.add("metadata-fade-in");
                
                if (self.config.metadataMode === "fade") {
                    // Clear any existing timeout
                    if (self.metadataTimeout) {
                        clearTimeout(self.metadataTimeout);
                    }
                    
                    // Fade out after 5 seconds
                    self.metadataTimeout = setTimeout(function() {
                        requestAnimationFrame(function() {
                            metadataElement.classList.remove("metadata-fade-in");
                            metadataElement.classList.add("metadata-fade-out");
                            
                            // Hide after animation completes
                            setTimeout(function() {
                                metadataElement.classList.add("rpmhidden");
                            }, 300);
                        });
                    }, 5000);
                }
            });
        } else {
            console.log("[MMM-RandomPhoto] No metadata content to display");
            self.hideMetadata();
        }
    },
    
    hideMetadata: function() {
        var metadataElement = document.getElementById("randomPhotoMetadata");
        if (metadataElement) {
            // Clear any existing timeout
            if (this.metadataTimeout) {
                clearTimeout(this.metadataTimeout);
                this.metadataTimeout = null;
            }
            
            requestAnimationFrame(function() {
                metadataElement.classList.remove("metadata-fade-in");
                metadataElement.classList.add("metadata-fade-out");
                
                setTimeout(function() {
                    metadataElement.classList.add("rpmhidden");
                }, 300);
            });
        }
    },
    
    escapeHtml: function(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatDate: function(dateString) {
        try {
            var date = new Date(dateString.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return dateString;
            }
            
            // Use Intl.DateTimeFormat for better performance and localization
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date);
        } catch (e) {
            // Fallback: try to extract just the date part
            if (typeof dateString === 'string' && dateString.length >= 10) {
                try {
                    var datePart = dateString.substring(0, 10).replace(/:/g, '-');
                    var fallbackDate = new Date(datePart);
                    if (!isNaN(fallbackDate.getTime())) {
                        return fallbackDate.toLocaleDateString();
                    }
                } catch (fallbackError) {
                    // Just return the original string
                }
            }
            return dateString;
        }
    },
    
    cacheMetadata: function(imagePath, metadata) {
        var self = this;
        
        // Implement LRU cache to limit memory usage
        if (self.metadataCache.size >= self.config.metadataCacheSize) {
            var firstKey = self.metadataCache.keys().next().value;
            self.metadataCache.delete(firstKey);
        }
        
        self.metadataCache.set(imagePath, metadata);
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.id = "randomPhoto";

        var img1 = document.createElement("img");
        img1.id = "randomPhoto-placeholder1";
        var img2 = document.createElement("img");
        img2.id = "randomPhoto-placeholder2";

        // Only apply grayscale / blur css classes if we are NOT using picsum, as picsum is doing it via URL parameters
        if (this.nextcloud || this.localdirectory) {
            if (this.config.grayscale) {
                img1.classList.add("grayscale");
                img2.classList.add("grayscale");
            }
            if (this.config.blur) {
                img1.classList.add("blur");
                img2.classList.add("blur");
                img1.style.setProperty("--randomphoto-blur-value", this.config.blurAmount + "px");
                img2.style.setProperty("--randomphoto-blur-value", this.config.blurAmount + "px");
            }
        }

        // Apply image fit configuration
        if (this.config.imageFit && this.config.imageFit !== "cover") {
            img1.classList.add("fit-" + this.config.imageFit);
            img2.classList.add("fit-" + this.config.imageFit);
        }

        wrapper.appendChild(img1);
        wrapper.appendChild(img2);
        //wrapper.innerHTML = '<img id="randomPhoto-placeholder1" /><img id="randomPhoto-placeholder2" />';
        if (this.config.showStatusIcon) {
            var validatePosition = ['top_right', 'top_left', 'bottom_right', 'bottom_left'];
            if (validatePosition.indexOf(this.config.statusIconPosition) === -1) {
                this.config.statusIconPosition = 'top_right';
            }
            var statusIconObject = document.createElement("span");
            statusIconObject.id = "randomPhotoIcon";
            statusIconObject.classList.add("dimmed");
            this.config.statusIconPosition.split("_").forEach(function(extractedName) {
                statusIconObject.classList.add("rpi" + extractedName);
            });
            statusIconObject.innerHTML = '<i id="randomPhotoStatusIcon" class="rpihidden"></i>';
            wrapper.appendChild(statusIconObject);
        }
        
        // Add metadata display element
        if (this.config.showMetadata) {
            var validateMetadataPosition = ['bottom_left', 'bottom_right', 'top_left', 'top_right'];
            if (validateMetadataPosition.indexOf(this.config.metadataPosition) === -1) {
                this.config.metadataPosition = 'bottom_left';
            }
            
            var metadataObject = document.createElement("div");
            metadataObject.id = "randomPhotoMetadata";
            metadataObject.classList.add("rpmhidden"); // Start hidden
            
            // Position the metadata element
            var positionClasses = this.config.metadataPosition.split("_");
            metadataObject.style.position = "absolute";
            
            if (positionClasses.includes("top")) {
                metadataObject.style.top = "20px";
                metadataObject.style.bottom = "auto";
            } else {
                metadataObject.style.bottom = "20px";
                metadataObject.style.top = "auto";
            }
            
            if (positionClasses.includes("right")) {
                metadataObject.style.right = "20px";
                metadataObject.style.left = "auto";
            } else {
                metadataObject.style.left = "20px";
                metadataObject.style.right = "auto";
            }
            
            wrapper.appendChild(metadataObject);
        }
        
        return wrapper;
    },

    getScripts: function() {
        return [
            this.file('node_modules/jquery/dist/jquery.min.js')
        ]
    },

    getStyles: function() {
        return [
            "MMM-RandomPhoto.css",
            "font-awesome.css"
        ];
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === "MODULE_DOM_CREATED") {
            if (this.config.startHidden) {
                this.hide();
            } else {
                if (!this.nextcloud && !this.localdirectory) {
                    // only start "right away" if we display "picsum" images. Otherwise wait until we receive the "IMAGE_LIST" socketNotification
                    this.resumeImageLoading(true);
                }
            }
        }
        if (notification === "RANDOMPHOTO_NEXT") {
            // Don't call the pause or resume functions here, so we can actually work with both states ("paused" and "active"), so independent of what "this.running" is set to
            clearTimeout(this.updateTimer);
            this.load();
            if (this.config.showStatusIcon) {
                this.loadIcon("right");
            }
        }
        if (notification === "RANDOMPHOTO_PREVIOUS") {
            // Only allow this if we are NOT in random mode and NOT use picsum as a source
            if (!this.config.random && (this.nextcloud || this.localdirectory)) {
                clearTimeout(this.updateTimer);
                this.load("previous");
                if (this.config.showStatusIcon) {
                    this.loadIcon("left");
                }
            }
        }
        if (notification === "RANDOMPHOTO_TOGGLE") {
            if (this.running) {
                this.pauseImageLoading();
            } else {
                this.resumeImageLoading(false);
            }
        }
        if (notification === "RANDOMPHOTO_PAUSE") {
            this.pauseImageLoading();
        }
        if (notification === "RANDOMPHOTO_RESUME") {
            this.resumeImageLoading(false);
        }
    },

    socketNotificationReceived: function(notification, payload) {
        //Log.log("["+ this.name + "] received a '" + notification + "' with payload: " + payload);
        //console.dir(payload);
        if (notification === "IMAGE_LIST") {
            this.imageList = payload;
            // After we now received the image list, go ahead and display them (only when not starting as hidden)
            if(!this.config.startHidden) {
                this.resumeImageLoading(true);
            }
        }
        if (notification === "IMAGE_METADATA") {
            console.log("[MMM-RandomPhoto] Received metadata notification:", payload);
            // Cache the metadata for performance
            this.cacheMetadata(payload.imagePath, payload.metadata);
            this.displayMetadata(payload.metadata);
        }
    },

    suspend: function() {
        this.pauseImageLoading();
    },

    resume: function() {
        this.resumeImageLoading(true);
    }

});
