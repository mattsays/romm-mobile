import * as FileSystem from 'expo-file-system/legacy';
import { openDocumentTree, mkdir, createFile, moveFile, unlink, stat, listFiles, exists } from "@joplin/react-native-saf-x";
import { unzip, subscribe } from 'react-native-zip-archive';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { PlatformFolder } from '../hooks/usePlatformFolders';
import { useRomFileSystem } from '../hooks/useRomFileSystem';
import { apiClient, Rom, RomFile } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Define the types here to avoid import issues
export enum DownloadStatus {
    PENDING = 'pending',
    DOWNLOADING = 'downloading',
    PAUSED = 'paused',
    EXTRACTING = 'extracting',
    MOVING = 'moving',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

export interface DownloadItem {
    id: string;
    rom: Rom;
    romName: string;
    romFile: RomFile;
    platformFolder: PlatformFolder;
    status: DownloadStatus;
    progress: number;
    downloadedBytes: number;
    totalBytes: number;
    speed: number; // bytes per second
    remainingTime: number; // seconds
    error?: string;
    startTime?: Date;
    endTime?: Date;
    downloadResumable?: FileSystem.DownloadResumable;
}

interface DownloadContextType {
    downloads: DownloadItem[];
    activeDownloads: DownloadItem[];
    completedDownloads: DownloadItem[];
    failedDownloads: DownloadItem[];
    isRomDownloading: (romFile: RomFile) => boolean;
    getDownloadById: (id: string) => DownloadItem | undefined;
    addRomToQueue: (rom: Rom, romFile: RomFile, platformFolder: PlatformFolder) => string;
    removeFromQueue: (downloadId: string) => void;
    retryDownload: (downloadId: string) => void;
    clearCompleted: () => void;
    clearFailed: () => void;
    pauseDownload: (downloadId: string) => void;
    resumeDownload: (downloadId: string) => void;
    cancelDownload: (downloadId: string) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const useDownload = () => {
    const context = useContext(DownloadContext);
    if (context === undefined) {
        throw new Error('useDownload must be used within a DownloadProvider');
    }
    return context;
};

interface DownloadProviderProps {
    children: ReactNode;
}

export const DownloadProvider: React.FC<DownloadProviderProps> = ({ children }) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [downloadQueue, setDownloadQueue] = useState<string[]>([]);
    const [activeDownloads, setActiveDownloads] = useState<Set<string>>(new Set());
    const { refreshRomCheck } = useRomFileSystem();

    const getConcurrentDownloadsLimit = async (): Promise<number> => {
        try {
            const value = await AsyncStorage.getItem('concurrentDownloads');
            if (value !== null) {
                const numValue = parseInt(value, 10);
                return (numValue >= 1 && numValue <= 5) ? numValue : 2;
            }
            return 2; // Default
        } catch (error) {
            return 2; // Fallback
        }
    };

    // Process download queue
    useEffect(() => {
        const processQueue = async () => {
            console.log('Processing download queue:', downloadQueue);
            const maxConcurrentDownloads = await getConcurrentDownloadsLimit();
            if (downloadQueue.length > 0 && activeDownloads.size < maxConcurrentDownloads) {
                const downloadId = downloadQueue[0];
                const download = downloads.find(d => d.id === downloadId);

                if (download && download.status === DownloadStatus.PENDING) {
                    setDownloadQueue(prev => prev.slice(1));
                    setActiveDownloads(prev => new Set([...prev, downloadId]));
                    await startDownload(downloadId);
                }
            }
        };

        processQueue();
    }, [downloadQueue, activeDownloads, downloads.length]);

    const generateDownloadId = (): string => {
        return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    const updateDownload = (downloadId: string, updates: Partial<DownloadItem>): void => {
        setDownloads(prev =>
            prev.map(d => d.id === downloadId ? { ...d, ...updates } : d)
        );
    };

    const startDownload = async (downloadId: string): Promise<void> => {
        const download = downloads.find(d => d.id === downloadId);
        if (!download) return;

        try {
            updateDownload(downloadId, {
                status: DownloadStatus.DOWNLOADING,
                startTime: new Date(),
            });

            // Get the download URL from the API
            const downloadUrl = await apiClient.obtainDownloadLink(download.romFile);
            const tempFilePath = FileSystem.cacheDirectory + download.romFile.file_name;
            console.log(`Starting download for ROM: ${download.romName}, File path: ${tempFilePath}`);
            // Initialize speed tracking
            let lastProgressTime = Date.now();
            let lastDownloadedBytes = 0;
            let speedHistory: number[] = [];
            let currentSpeed = 0; // Keep track of current speed
            let currentRemainingTime = 0; // Keep track of current remaining time
            const maxSpeedHistoryLength = 5; // Keep last 5 speed measurements for smoothing
            const minTimeForSpeedCalculation = 3.0; // Minimum time in seconds for speed calculation

            // Create download resumable
            const downloadResumable = FileSystem.createDownloadResumable(
                downloadUrl,
                tempFilePath,
                {
                    headers: apiClient.getAuthHeaders(),
                },
                (downloadProgress) => {
                    

                    // Calculate speed only when enough time has passed
                    const currentTime = Date.now();
                    const timeElapsed = (currentTime - lastProgressTime) / 1000; // seconds
                    const bytesDownloaded = downloadProgress.totalBytesWritten - lastDownloadedBytes;

                    if (timeElapsed >= minTimeForSpeedCalculation && bytesDownloaded > 0) {
                        const instantSpeed = bytesDownloaded / timeElapsed; // bytes per second

                        // Add to speed history for smoothing
                        speedHistory.push(instantSpeed);
                        if (speedHistory.length > maxSpeedHistoryLength) {
                            speedHistory = speedHistory.slice(-maxSpeedHistoryLength);
                        }

                        // Calculate average speed for smoother display
                        currentSpeed = speedHistory.reduce((sum, s) => sum + s, instantSpeed) / speedHistory.length;

                        const remainingBytes = downloadProgress.totalBytesExpectedToWrite - downloadProgress.totalBytesWritten;
                        currentRemainingTime = currentSpeed > 0 ? remainingBytes / currentSpeed : 0;

                        // Update tracking variables for next calculation
                        lastProgressTime = currentTime;
                        lastDownloadedBytes = downloadProgress.totalBytesWritten;

                        const progress = Math.round(
                            (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
                        );

                        updateDownload(downloadId, {
                            progress,
                            downloadedBytes: downloadProgress.totalBytesWritten,
                            totalBytes: downloadProgress.totalBytesExpectedToWrite,
                            speed: currentSpeed, // Use the last calculated speed
                            remainingTime: currentRemainingTime, // Use the last calculated remaining time
                        });
                    }


                }
            );

            updateDownload(downloadId, {
                downloadResumable,
            });

            const res = await downloadResumable.downloadAsync();

            if (res) {
                if (res.status === 200) {
                    await completeDownload(downloadId, tempFilePath, download);
                } else {
                    throw new Error(`Download failed with status ${res?.status || 'unknown'}`);
                }
            }
        } catch (error) {
            console.error('Download error:', error);
            updateDownload(downloadId, {
                status: DownloadStatus.FAILED,
                error: error instanceof Error ? error.message : 'Unknown error',
                endTime: new Date(),
            });
        } finally {
            setActiveDownloads(prev => {
                const newSet = new Set(prev);
                newSet.delete(downloadId);
                return newSet;
            });
        }
    };

    const completeDownload = async (downloadId: string, tempFilePath: string, download: DownloadItem): Promise<void> => {
        try {


            const updateDownloadProgress = async (filePath: string, expectedFileSize: number) => {

                const fileExists = await ReactNativeBlobUtil.fs.exists(filePath);

                if(!fileExists) {
                    setTimeout(() => { updateDownloadProgress(filePath, expectedFileSize) }, 100);
                    return;
                }

                const fileStatus = await ReactNativeBlobUtil.fs.stat(filePath);

                const newProgress = Math.round((fileStatus.size / expectedFileSize) * 100);
                updateDownload(downloadId, {
                    status: DownloadStatus.MOVING,
                    progress: newProgress,
                    downloadedBytes: fileStatus.size,
                    totalBytes: expectedFileSize,
                    endTime: new Date(),
                });

                if(newProgress < 100) {
                    setTimeout(() => { updateDownloadProgress(filePath, expectedFileSize) }, 1000); 
                } else {
                    updateDownload(downloadId, {
                        status: DownloadStatus.COMPLETED,
                        progress: 100,
                        endTime: new Date(),
                    })
                }
            };

            const isZip = download.romFile.file_name.endsWith('.zip');
            const value = await AsyncStorage.getItem('unzipFilesOnDownload');
            const shouldUnzipFiles = value !== null ? JSON.parse(value) : true; // Default to true if not set
            //const shouldUnzipFiles = true; // For now, always unzip files

            if (isZip && shouldUnzipFiles) {
                console.log(`Unzipping file: ${tempFilePath}`);
                const unzipPath = FileSystem.documentDirectory + `${download.romFile.file_name.replace('.zip', '')}` || '';

                updateDownload(downloadId, {
                    status: DownloadStatus.EXTRACTING,
                    progress: 0,
                });

                const zipProgressSubscription = subscribe(({ progress, filePath }) => {
                    updateDownload(downloadId, {
                        status: DownloadStatus.EXTRACTING,
                        progress: Math.round(progress * 100),
                        endTime: new Date(),
                    });
                })

                // Here we use different methods based on platform
                if (Platform.OS === 'android') {
                    const unzipedFile = await unzip(tempFilePath, unzipPath);
                    console.log(`Unzipped to: ${unzipedFile}`);

                    zipProgressSubscription.remove();

                    updateDownload(downloadId, {
                        status: DownloadStatus.MOVING,
                        progress: 0,
                        endTime: new Date(),
                    });

                    // List files
                    const files = await ReactNativeBlobUtil.fs.ls(unzipPath);

                    console.log('Unzipped files to:', unzipPath);

                    // Remove the original zip file
                    await unlink(tempFilePath);
                
                    // Move every file in the unzipped folder to the platform folder
                    for (const file of files) {
                        const sourcePath = `${unzipPath}/${file}`;
                        var destinationPath = `${download.platformFolder.folderUri}/${file}`;
                        console.log(`Moving file from ${sourcePath} to ${destinationPath}`);
                        try {
                            const fileStatus = await ReactNativeBlobUtil.fs.stat(sourcePath);
                            updateDownloadProgress(destinationPath, fileStatus.size);
                            await moveFile(sourcePath, destinationPath, { replaceIfDestinationExists: true });
                        } catch (_) {}
                    }

                    // Remove the unzipped folder
                    await unlink(unzipPath);
                }
                else {
                    // Unzip directly into the platform folder
                    const unzipedFile = await unzip(tempFilePath, download.platformFolder.folderUri);
                    console.log(`Unzipped directly to: ${unzipedFile}`);
                    zipProgressSubscription.remove();
                }

            } else {
                updateDownload(downloadId, {
                    status: DownloadStatus.MOVING,
                    progress: 0,
                    endTime: new Date(),
                });


                // Seems to give an error despite actually moving the file correctly, just ignore the error
                try {
                    const sourcePath = download.platformFolder.folderUri + '/' + download.romFile.file_name;
                    
                    if(Platform.OS === 'android') {
                        const fileStatus = await stat(tempFilePath);
                        await updateDownloadProgress(sourcePath, fileStatus.size);
                        await moveFile(tempFilePath, sourcePath, { replaceIfDestinationExists: true });
                    } else {
                        console.log('Moving file from', tempFilePath, 'to', sourcePath);
                        // const fileStatus = await FileSystem.getInfoAsync(tempFilePath);
                        await updateDownloadProgress(sourcePath, 0);
                        //console.log('File status:', fileStatus);
                        await FileSystem.moveAsync({
                            from: tempFilePath,
                            to: sourcePath,
                        });

                    }
                } catch (e) {
                    console.warn('Error moving file:', e);
                }
            }

            
            updateDownload(downloadId, {
                status: DownloadStatus.COMPLETED,
                progress: 100,
                endTime: new Date(),
            });

            // Update the ROM file system cache to mark the ROM as downloaded
            try {
                await refreshRomCheck(download.romFile, download.platformFolder);
                console.log(`ROM ${download.romName} marked as downloaded in filesystem cache`);
            } catch (error) {
                console.error('Error updating ROM filesystem cache:', error);
                // Don't fail the download completion if cache update fails
            }

        } catch (error) {
            console.error('Error completing download:', error);
            updateDownload(downloadId, {
                status: DownloadStatus.FAILED,
                error: `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                endTime: new Date(),
            });
        }
    };

    const activeDownloadsList = downloads.filter(d =>
        d.status === DownloadStatus.DOWNLOADING ||
        d.status === DownloadStatus.PENDING ||
        d.status === DownloadStatus.EXTRACTING ||
        d.status === DownloadStatus.MOVING
    );

    const completedDownloads = downloads.filter(d =>
        d.status === DownloadStatus.COMPLETED
    );

    const failedDownloads = downloads.filter(d =>
        d.status === DownloadStatus.FAILED ||
        d.status === DownloadStatus.CANCELLED
    );

    const isRomDownloading = (romFile: RomFile): boolean => {
        return downloads.some(d =>
            d.romFile.rom_id === romFile.rom_id &&
            (d.status === DownloadStatus.DOWNLOADING || d.status === DownloadStatus.PENDING)
        );
    };

    const getDownloadById = (id: string): DownloadItem | undefined => {
        return downloads.find(d => d.id === id);
    };

    const extractRomName = (romFile: RomFile): string => {
        const fileName = romFile.file_name || '';
        const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, ''); // Remove file extension
        const nameWithoutTags = nameWithoutExtension.replace(/(\[.*?\]|\(.*?\))/g, '').trim(); // Remove tags in square brackets or parentheses
        return nameWithoutTags;
    };

    const addRomToQueue = (rom: Rom, romFile: RomFile, platformFolder: PlatformFolder): string => {

        // Check if ROM is already in queue or downloading
        const existingDownload = downloads.find(d =>
            d.romFile.rom_id === romFile.rom_id &&
            (d.status === DownloadStatus.PENDING ||
                d.status === DownloadStatus.DOWNLOADING ||
                d.status === DownloadStatus.PAUSED)
        );

        if (existingDownload) {
            return existingDownload.id;
        }

        const downloadId = generateDownloadId();
        const newDownload: DownloadItem = {
            id: downloadId,
            rom: rom,
            romName: extractRomName(romFile),
            romFile,
            platformFolder,
            status: DownloadStatus.PENDING,
            progress: 0,
            downloadedBytes: 0,
            totalBytes: romFile.file_size_bytes,
            speed: 0,
            remainingTime: 0,
        };

        setDownloads(prev => [...prev, newDownload]);
        setDownloadQueue(prev => [...prev, downloadId]);

        return downloadId;
    };

    const removeFromQueue = (downloadId: string): void => {
        const download = downloads.find(d => d.id === downloadId);
        if (download) {
            // Cancel if actively downloading
            if (download.status === DownloadStatus.DOWNLOADING) {
                cancelDownload(downloadId);
            }

            // Remove from queue
            setDownloadQueue(prev => prev.filter(id => id !== downloadId));

            // Remove from downloads
            setDownloads(prev => prev.filter(d => d.id !== downloadId));
        }
    };

    const retryDownload = (downloadId: string): void => {
        const download = downloads.find(d => d.id === downloadId);
        if (download && (download.status === DownloadStatus.FAILED || download.status === DownloadStatus.CANCELLED)) {
            updateDownload(downloadId, {
                status: DownloadStatus.PENDING,
                progress: 0,
                downloadedBytes: 0,
                error: undefined,
                startTime: undefined,
                endTime: undefined,
            });

            setDownloadQueue(prev => [downloadId, ...prev]); // Add to front of queue
        }
    };

    const clearCompleted = (): void => {
        setDownloads(prev => prev.filter(d => d.status !== DownloadStatus.COMPLETED));
    };

    const clearFailed = (): void => {
        setDownloads(prev => prev.filter(d =>
            d.status !== DownloadStatus.FAILED &&
            d.status !== DownloadStatus.CANCELLED
        ));
    };

    const pauseDownload = async (downloadId: string): Promise<void> => {
        const download = downloads.find(d => d.id === downloadId);
        if (download && download.status === DownloadStatus.DOWNLOADING) {
            if (download.downloadResumable) {
                await download.downloadResumable.pauseAsync();
            }

            updateDownload(downloadId, {
                status: DownloadStatus.PAUSED,
            });
        }
    };

    const resumeDownload = async (downloadId: string): Promise<void> => {
        const download = downloads.find(d => d.id === downloadId);
        if (download && download.status === DownloadStatus.PAUSED) {

            updateDownload(downloadId, {
                status: DownloadStatus.DOWNLOADING,
            });

            if (download.downloadResumable) {
                await download.downloadResumable.resumeAsync().then(async (result) => {
                    if (result) {
                        if (result.status === 200 || result.status === 206) {
                            await completeDownload(downloadId, FileSystem.cacheDirectory + download.romFile.file_name, download);
                        } else {
                            console.log(`Download failed with status ${result?.status || 'unknown'}`);
                        }
                    }
                });
            }
        }
    };

    const cancelDownload = (downloadId: string): void => {
        const download = downloads.find(d => d.id === downloadId);
        if (download) {

            if (download.downloadResumable && download.status === DownloadStatus.DOWNLOADING) {
                download.downloadResumable.pauseAsync();
            }

            // Clean up temp file if exists
            if (download.downloadResumable?.fileUri) {
                FileSystem.deleteAsync(FileSystem.cacheDirectory + download.romFile.file_name, { idempotent: true });
            }

            updateDownload(downloadId, {
                status: DownloadStatus.CANCELLED,
                endTime: new Date(),
            });

            setActiveDownloads(prev => {
                const newSet = new Set(prev);
                newSet.delete(downloadId);
                return newSet;
            });

            // Remove from queue if pending
            setDownloadQueue(prev => prev.filter(id => id !== downloadId));
        }
    };

    return (
        <DownloadContext.Provider
            value={{
                downloads,
                activeDownloads: activeDownloadsList,
                completedDownloads,
                failedDownloads,
                isRomDownloading,
                getDownloadById,
                addRomToQueue,
                removeFromQueue,
                retryDownload,
                clearCompleted,
                clearFailed,
                pauseDownload,
                resumeDownload,
                cancelDownload,
            }}
        >
            {children}
        </DownloadContext.Provider>
    );
};
