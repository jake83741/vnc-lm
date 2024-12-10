#!/bin/bash

# Function to import cache
import_cache() {
    if [ -f /app/cache/bot_cache.json ]; then
        cp /app/cache/bot_cache.json /app/bot_cache.json
        echo "Cache file imported"
    else
        echo "No cache file found to import"
        touch /app/bot_cache.json
        echo "Created empty bot_cache.json"
    fi
}

# Function to export cache
export_cache() {
    if [ -f /app/bot_cache.json ]; then
        cp /app/bot_cache.json /app/cache/bot_cache.json
        echo "Cache file exported"
    else
        echo "No cache file found to export"
    fi
}

# Import cache on startup
import_cache

# Setup a trap to export cache on SIGTERM and SIGINT
trap 'export_cache; exit 0' SIGTERM SIGINT

# Start the application
npm start &

# Wait for the application to exit
wait $!

# Export cache after the application exits
export_cache
