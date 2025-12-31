import * as SecureStore from 'expo-secure-store';


const DEFAULT_API_URL = 'http://romm:8080';

// Authentication types
export interface LoginCredentials {
    username: string;
    password: string;
}

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
}

export interface User {
    id: number;
    username: string;
    email: string;
    role: string;
    enabled: boolean;
    avatar_path?: string;
    last_login?: string;
    created_at: string;
    updated_at: string;
}


export interface MessageResponse {
    msg: string;
}

export interface ResetPasswordRequest {
    username: string;
}

export interface ResetPasswordData {
    new_password: string;
    token?: string;
}

// Types for the API responses
export interface Platform {
    id: number;
    slug: string;
    name: string;
    fs_slug: string;
    url_logo?: string;
    igdb_id?: number;
    sgdb_id?: number;
    logo_path?: string;
    rom_count: number;
}

export type CollectionType = 'collection' | 'franchise' | 'genre' | 'company' | 'mode';


export interface Collection {
    id: number;
    name: string;
    type: CollectionType;
    description?: string;
    path_covers_small: string[];
    path_covers_large: string[];
    rom_ids: number[];
    rom_count: number;
    created_at: string;
    updated_at: string;
    is_virtual: boolean;

}

export interface RomFile {
    id: number;
    rom_id: number;
    file_name: string;
    file_extension: string;
    file_path: string;
    file_size_bytes: number;
    md5_hash?: string;
    crc_hash?: string;
    sha1_hash?: string;
}

export interface RomSibling {
    id: number;
    name: string;
    fs_name_no_tags: string;
    fs_name_no_ext: string;
    sort_comparator: string;
}

export interface Rom {
    id: number;
    name?: string;
    slug?: string;
    summary?: string;
    platform_id: number;
    platform_name: string;
    platform_slug: string;
    fs_name: string;
    fs_name_no_ext: string;
    fs_size_bytes: number;
    files: RomFile[];
    siblings?: RomSibling[];
    url_cover?: string;
    igdb_id?: number;
    sgdb_id?: number;
    moby_id?: number;
    ss_id?: number;
    ra_id?: number;
}

export interface Firmware {
    id: number;
    file_name: string;
    file_name_no_tags: string;
    file_name_no_ext: string;
    file_extension: string;
    file_path: string;
    file_size_bytes: number;
    full_path: string;
    is_verified: boolean;
    crc_hash: string;
    md5_hash: string;
    sha1_hash: string;
    missing_from_fs: boolean;
    created_at: string;
    updated_at: string;
}

export type SearchOrderCriteria = 'name' | 'fs_size_bytes' | 'created_at' | 'first_release_date' | 'average_rating';
export type SearchOrderDirection = 'asc' | 'desc';

export interface SearchOptions {
    order_by?: SearchOrderCriteria;
    order_dir?: SearchOrderDirection;
    limit?: number;
    offset?: number;
}

export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
}

export interface ItemsResponse<T> {
    items: T[];
    total?: number;
    page?: number;
    per_page?: number;
}

class ApiClient {
    public baseUrl: string;
    private credentials: LoginCredentials | null = null;
    private credentialsLoaded: boolean = false;
    private isSessionValid: boolean = false;

    constructor() {
        // Try load url from secure storage
        this.baseUrl = DEFAULT_API_URL; // Default URL
        SecureStore.getItemAsync('server_url')
            .then(url => {
                if (url) {
                    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash if present
                } else {
                    this.baseUrl = DEFAULT_API_URL;
                }
                console.log('API base URL set to:', this.baseUrl);
                this.loadCredentialsFromStorage();
            });
    }

    // Method to update base URL
    updateBaseUrl(newUrl: string): void {
        // Remove trailing slash if present
        this.baseUrl = newUrl.replace(/\/$/, '');
    }

    private async loadCredentialsFromStorage(): Promise<void> {
        try {
            const [username, password] = await Promise.all([
                SecureStore.getItemAsync('username'),
                SecureStore.getItemAsync('password')
            ]);

            if (username && password) {
                this.credentials = { username, password };
            }
        } catch (error) {
            console.error('Failed to load credentials from storage:', error);
        } finally {
            this.credentialsLoaded = true;
        }
    }

    async waitForCredentialsLoad(): Promise<void> {
        if (this.credentialsLoaded) return;

        // Wait for token to be loaded
        while (!this.credentialsLoaded) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    private async saveCredentialsToStorage(credentials: LoginCredentials): Promise<void> {
        try {
            await Promise.all([
                SecureStore.setItemAsync('username', credentials.username),
                SecureStore.setItemAsync('password', credentials.password)
            ]);
            this.credentials = credentials;
        } catch (error) {
            console.error('Failed to save credentials to storage:', error);
        }
    }

    private async removeCredentialsFromStorage(): Promise<void> {
        try {
            console.debug('Removing credentials from storage');
            await Promise.all([
                SecureStore.deleteItemAsync('username'),
                SecureStore.deleteItemAsync('password')
            ]);
            this.credentials = null;
        } catch (error) {
            console.error('Failed to remove credentials from storage:', error);
        }
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        console.log('Making API request to:', url, 'with options:', options);

        const defaultHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.credentials) {
            defaultHeaders['Authorization'] = `Basic ${btoa(`${this.credentials.username}:${this.credentials.password}`)}`;
        }

        // Merge with any provided headers
        const headers = {
            ...defaultHeaders,
            ...(options.headers as Record<string, string>),
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            if (!response.ok) {
                if (response.status % 400 < 100) {
                    // Token expired or invalid, remove it
                    await this.removeCredentialsFromStorage();
                    console.log("Response text:", await response.text());
                    throw new Error('Unauthorized - please login again');
                }
                console.log("Response text:", await response.text());
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async getPlatforms(): Promise<Platform[]> {
        return this.request<Platform[]>('/api/platforms');
    }

    async getPlatform(platformId: number): Promise<Platform> {
        return this.request<Platform>(`/api/platforms/${platformId}`);
    }

    async getUserCollections(): Promise<Collection[]> {
        return this.request<Collection[]>('/api/collections');
    }

    async getVirtualCollections(type: CollectionType = 'collection'): Promise<Collection[]> {
        return this.request<Collection[]>(`/api/collections/virtual?type=${type}`);
    }

    async getAllVirtualCollections(): Promise<Record<CollectionType, Collection[]>> {
        const types: CollectionType[] = ['collection', 'franchise', 'genre', 'company', 'mode'];
        const collections: Record<CollectionType, Collection[]> = {} as Record<CollectionType, Collection[]>;

        for (const type of types) {
            collections[type] = await this.getVirtualCollections(type);
        }

        return collections;
    }


    async getCollection(collectionId: string, isVirtual: boolean): Promise<Collection> {

        if (isVirtual) {
            return this.request<Collection>(`/api/collections/virtual/${collectionId}`);
        }

        return this.request<Collection>(`/api/collections/${collectionId}`);
    }

    async getRomsByCollection(collectionId: string, isVirtual: boolean, limit: number = 10, offset: number = 0, includeSiblings: boolean = true): Promise<ItemsResponse<Rom>> {

        let roms;

        if (isVirtual) {
            roms = await this.request<ItemsResponse<Rom>>(`/api/roms?group_by_meta_id=1&virtual_collection_id=${collectionId}&limit=${limit}&offset=${offset}`);
        } else {
            roms = await this.request<ItemsResponse<Rom>>(`/api/roms?group_by_meta_id=1&collection_id=${collectionId}&limit=${limit}&offset=${offset}`);
        }

        if (includeSiblings) {
            // Fetch siblings for each ROM
            await Promise.all(roms.items.map(async (rom) => {
                if (rom.siblings) {
                    await Promise.all(rom.siblings.map(async (sibling) => {
                        const siblingFile = await this.request<Rom>(`/api/roms/${sibling.id}`);
                        rom.files.push(siblingFile.files[0]);
                    }));
                }
            }));
        }

        return roms;
    }

    async getRomsRecentlyAdded(includeSiblings: boolean = true): Promise<Rom[]> {

        const response = await this.request<ItemsResponse<Rom>>('/api/roms?order_by=id&order_dir=desc&limit=15&group_by_meta_id=1');
        const roms = response.items;

        if (includeSiblings) {
            // Fetch siblings for each ROM
            await Promise.all(roms.map(async (rom) => {
                if (rom.siblings) {
                    await Promise.all(rom.siblings.map(async (sibling) => {
                        const siblingFile = await this.request<Rom>(`/api/roms/${sibling.id}`);
                        rom.files.push(siblingFile.files[0]);
                    }));
                }
            }));
        }

        return roms;
    }

    async getRomsByPlatform(platformId: number, limit: number = 20, offset: number = 0, includeSiblings: boolean = true): Promise<ItemsResponse<Rom>> {
        const res = await this.request<ItemsResponse<Rom>>(`/api/roms?platform_id=${platformId}&limit=${limit}&offset=${offset}&group_by_meta_id=1`);
        const roms = res.items;

        // Fetch siblings for each ROM
        if (includeSiblings) {
            await Promise.all(roms.map(async (rom) => {
                if (rom.siblings) {
                    await Promise.all(rom.siblings.map(async (sibling) => {
                        const siblingFile = await this.request<Rom>(`/api/roms/${sibling.id}`);
                        rom.files.push(siblingFile.files[0]);
                    }));
                }
            }));
        }

        return res;
    }

    async getRomById(romId: number, includeSiblings: boolean = true): Promise<Rom> {
        const rom = await this.request<Rom>(`/api/roms/${romId}`);
        console.log('Fetched ROM:', rom.fs_name);
        if (includeSiblings && rom.siblings) {
            console.log('Fetching siblings:', rom.siblings);
            await Promise.all(rom.siblings?.map(async (sibling) => {
                const romFile = (await this.request<Rom>(`/api/roms/${sibling.id}`)).files[0];
                console.log('Fetched sibling file:', romFile);
                rom.files.push(romFile);
            }));
            console.log('Fetched siblings for ROM:', rom.name, 'Total siblings:', rom.files.length);
        }
        return rom;
    }

    async getFirmwareList(platformId?: number): Promise<Firmware[]> {
        const url = platformId ? `/api/firmware?platform_id=${platformId}` : '/api/firmware';
        return this.request<Firmware[]>(url);
    }

    async obtainFirmwareDownloadLink(firmware: Firmware): Promise<string> {
        await this.waitForCredentialsLoad();
        const url = `${this.baseUrl}/api/firmware/${firmware.id}/content/${encodeURI(firmware.file_name)}`;
        return url;
    }

    async obtainDownloadLink(romFile: RomFile): Promise<string> {
        await this.waitForCredentialsLoad();
        const url = `${this.baseUrl}/api/roms/${romFile.rom_id}/content/${encodeURI(romFile.file_name)}`;
        return url; // Return the download URL for use with FileSystem
    }

    getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};

        if (this.credentials) {
            headers['Authorization'] = `Basic ${btoa(`${this.credentials.username}:${this.credentials.password}`)}`;
        }

        return headers;
    }

    async searchRoms(query: string, options: SearchOptions = {}): Promise<ItemsResponse<Rom>> {
        const response = await this.request<ItemsResponse<Rom>>(
            `/api/roms?group_by_meta_id=1&search_term=${encodeURIComponent(query)}&order_by=${options.order_by || 'name'}&order_dir=${options.order_dir || 'asc'}&limit=${options.limit || 20}&offset=${options.offset || 0}`);
        return response;
    }

    // Authentication methods
    async heartbeat(): Promise<boolean> {
        // Ping the server to check if it's alive
        try {
            const response = await fetch(`${this.baseUrl}`);
            console.log('Heartbeat response status:', response.status);
            return response.ok;
        } catch (error) {
            console.error('Error during heartbeat check:', error);
            return false;
        }
    }

    async login(credentials: LoginCredentials): Promise<MessageResponse> {

        const url = `${this.baseUrl}/api/login`;

        // Robust Base64 encoding for UTF-8 characters
        const encodeCredentials = (str: string) => {
            return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
                function toSolidBytes(match, p1) {
                    return String.fromCharCode(parseInt(p1, 16));
                }));
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    "Authorization": "Basic " + encodeCredentials(`${credentials.username}:${credentials.password}`),
                }
            });

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
                const text = await response.text();
                console.error("Received non-JSON response during login:", text.substring(0, 200)); // Log first 200 chars
                throw new Error(`Server returned non-JSON response (${response.status}). Possible proxy or auth error.`);
            }

            if (!response.ok) {
                console.log("Response body:", await response.text());
                if (response.status === 401) {
                    throw new Error('Unauthorized. Please check your credentials');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Save credentials for future requests
            await this.saveCredentialsToStorage(credentials);

            const data = await response.json();
            console.log('Login successful, response data:', data);
            return data;
        } catch (error) {
            console.error('Session login failed:', error);
            throw error;
        }
    }

    async logout(): Promise<MessageResponse> {
        await this.removeCredentialsFromStorage();
        return { msg: 'Logged out successfully' };
    }

    async getCurrentUser(): Promise<User> {
        return this.request<User>('/api/users/me');
    }

    async forgotPassword(data: ResetPasswordRequest): Promise<MessageResponse> {
        return this.request<MessageResponse>('/api/forgot-password', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async resetPassword(data: ResetPasswordData): Promise<MessageResponse> {
        return this.request<MessageResponse>('/api/reset-password', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Token management
    isAuthenticated(): boolean {
        return this.credentials !== null || this.isSessionValid;
    }

    async clearAuth(): Promise<void> {
        await this.removeCredentialsFromStorage();
        this.isSessionValid = false;
    }

    async checkSession(): Promise<boolean> {
        try {
            // Try to fetch the current user to see if the session cookie is valid
            const user = await this.getCurrentUser();
            if (user) {
                console.log('Session is valid for user:', user.username);
                this.isSessionValid = true;
                return true;
            }
        } catch (error) {
            console.log('Session check failed:', error);
        }
        this.isSessionValid = false;
        return false;
    }
}

export const apiClient = new ApiClient();
