import * as SAF from "@joplin/react-native-saf-x";
import * as FileSystem from "expo-file-system";
import { useCallback, useMemo, useState } from "react";
import { RomFile } from "../services/api";
import { PlatformFolder, usePlatformFolders } from "./usePlatformFolders";
import { useStorageAccessFramework } from "./useStorageAccessFramework";

interface RomHash {
  hash: string;
  lastModified: number;
}

export const useRomFileSystem = () => {
  const { searchPlatformFolder } = usePlatformFolders();
  const { isSafAvailable } = useStorageAccessFramework();
  const [fileChecks, setFileChecks] = useState<Record<number, boolean>>({});
  const [checking, setChecking] = useState<Record<number, boolean>>({});

  const checkIfRomExists = useCallback(
    async (
      romFile: RomFile,
      platformFolder: PlatformFolder
    ): Promise<boolean> => {
      // Check if there are files
      if (!romFile) {
        console.log("No files available for this ROM");
        return false;
      }

      if (!platformFolder || !platformFolder.folderUri) {
        console.warn(
          "No platform folder configured. Cannot check if ROM exists."
        );
        return false;
      }

      try {
        const fileNameWithoutExtension = romFile.file_name.replace(
          /\.[^/.]+$/,
          ""
        );

        var fileList: string[];

        if (isSafAvailable()) {
          // Use SAF for Android (non-TV)
          fileList = (await SAF.listFiles(platformFolder.folderUri)).map(
            (file) => file.name
          );
        } else {
          // Use expo-file-system Directory for Android TV and iOS
          const dir = new FileSystem.Directory(platformFolder.folderUri);
          const files = await dir.list();
          fileList = files.map((file) => file.name);
        }

        // Check if the ROM file exists in the platform folder
        const romExists = fileList.some((file) =>
          file.includes(fileNameWithoutExtension)
        );

        if (romExists) {
          console.log("ROM already exists in the folder:", romFile.file_name);
          setFileChecks((prev) => ({ ...prev, [romFile.rom_id]: true }));
          return true;
        }

        setFileChecks((prev) => ({ ...prev, [romFile.rom_id]: false }));
        return false;
      } catch (error) {
        console.error("Error checking existing files:", error);
        const exists = false;
        setFileChecks((prev) => ({ ...prev, [romFile.rom_id]: exists }));
        return exists;
      }
    },
    [searchPlatformFolder]
  );

  const isRomDownloaded = useCallback(
    (romFile: RomFile): boolean => {
      return fileChecks[romFile.rom_id] || false;
    },
    [fileChecks]
  );

  const isCheckingRom = useCallback(
    (romFile: RomFile): boolean => {
      return checking[romFile.rom_id] || false;
    },
    [checking]
  );

  const checkMultipleRoms = useCallback(
    async (
      romsFiles: RomFile[],
      platformFolder: PlatformFolder
    ): Promise<void> => {
      // Only check ROMs that haven't been checked yet
      const romsFilesToCheck = romsFiles.filter(
        (romFile) =>
          fileChecks[romFile.rom_id] === undefined && !checking[romFile.rom_id]
      );

      if (romsFilesToCheck.length === 0) {
        return;
      }

      // list all files in the platform folder
      if (!platformFolder || !platformFolder.folderUri) {
        console.warn(
          "No platform folder configured for:",
          platformFolder.platformSlug
        );
        return;
      }

      await Promise.all(
        romsFilesToCheck.map(async (romFile, _) => {
          await checkIfRomExists(romFile, platformFolder);
        })
      );
    },
    [checkIfRomExists, fileChecks, checking]
  );

  const refreshRomCheck = useCallback(
    async (
      romFile: RomFile,
      platformFolder: PlatformFolder
    ): Promise<boolean> => {
      console.log("Refreshing ROM check for:", romFile.file_name);

      if (fileChecks[romFile.rom_id] == true) {
        // If already checked and exists, return true
        return true;
      }

      return await checkIfRomExists(romFile, platformFolder);
    },
    [checkIfRomExists]
  );

  const resetRomsCheck = useCallback((romsFiles: RomFile[]) => {
    romsFiles.forEach((romFile, _) => {
      setFileChecks((prev) => ({ ...prev, [romFile.rom_id]: false }));
      setChecking((prev) => ({ ...prev, [romFile.rom_id]: false }));
    });
  }, []);

  const memoizedReturn = useMemo(
    () => ({
      resetRomsCheck,
      checkIfRomExists,
      isRomDownloaded,
      isCheckingRom,
      checkMultipleRoms,
      refreshRomCheck,
      fileChecks,
      checking,
    }),
    [
      resetRomsCheck,
      checkIfRomExists,
      isRomDownloaded,
      isCheckingRom,
      checkMultipleRoms,
      refreshRomCheck,
      fileChecks,
      checking,
      isSafAvailable,
    ]
  );

  return memoizedReturn;
};
