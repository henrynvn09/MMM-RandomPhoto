// Sample configuration for testing MMM-RandomPhoto with metadata
// Add this to your MagicMirror config.js modules array

{
    module: 'MMM-RandomPhoto',
    position: 'fullscreen_below',
    config: {
        imageRepository: "localdirectory",
        repositoryConfig: {
            path: "/Users/henry/Pictures", // Change this to a folder with your photos
            recursive: true,
            exclude: ["tmp", "#recycle", ".DS_Store"]
        },
        updateInterval: 30,
        showMetadata: true,
        metadataPosition: "bottom_left",
        metadataMode: "show", // Use "show" to always display, "fade" for temporary display
        metadataCacheSize: 100,
        opacity: 0.5,
        animationSpeed: 1000,
        showStatusIcon: true,
        statusIconPosition: "top_right"
    }
}

// Alternative test with fade mode:
/*
{
    module: 'MMM-RandomPhoto',
    position: 'fullscreen_below',
    config: {
        imageRepository: "localdirectory",
        repositoryConfig: {
            path: "/Users/henry/Pictures", // Change this to a folder with your photos
            recursive: true,
        },
        updateInterval: 15,
        showMetadata: true,
        metadataPosition: "bottom_left",
        metadataMode: "fade", // Shows for 5 seconds then fades out
        opacity: 0.4
    }
}
*/
