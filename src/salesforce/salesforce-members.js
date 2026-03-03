/**
 * Salesforce Members Fetcher
 * Reusable module to fetch metadata type members from Salesforce orgs.
 * Automatically routes to Tooling API or Metadata API based on type.
 * 
 * Dependencies: salesforce-connector.js
 * 
 * @version 1.0.0
 * @author Kartik Patkar
 * @license MIT
 * 
 * USAGE:
 * 
 * import SalesforceMembers from './salesforce-members.js';
 * 
 * const members = new SalesforceMembers({
 *   apiVersion: '56.0',
 *   connector: existingConnector  // optional
 * });
 * 
 * // Fetch members for any metadata type
 * const apexClasses = await members.getMembers('ApexClass');
 * const reports = await members.getMembers('Report');
 * const profiles = await members.getMembers('Profile');
 * 
 * // Check which API will be used
 * const usesTooling = members.isToolingType('ApexClass'); // true
 * const usesMetadata = members.isToolingType('Report');   // false
 */

import SalesforceConnector from './salesforce-connector.js';

// Production logging gate.
const DEBUG = false;
const dlog = (...args) => { if (DEBUG) console.log(...args); };

class SalesforceMembers {
    /**
     * @param {Object} options
     * @param {string} [options.apiVersion='56.0'] - Salesforce API version
     * @param {SalesforceConnector} [options.connector] - Optional shared connector instance
     */
    constructor(options = {}) {
        this.apiVersion = options.apiVersion || '56.0';
        this.connector = options.connector || new SalesforceConnector();
    }

    /**
     * Get members for a metadata type
     * @param {string} metadataType - Metadata type name (e.g., 'ApexClass', 'Report', 'Profile')
     * @returns {Promise<Array<string>>} Array of member names
     */
    async getMembers(metadataType) {
        if (!metadataType) {
            throw new Error('metadataType is required');
        }

        const org = await this._requireAuth();

        if (this.isToolingType(metadataType)) {
            dlog(`[SalesforceMembers] Fetching ${metadataType} via Tooling API`);
            return this._fetchViaToolingAPI(org, metadataType);
        } else {
            dlog(`[SalesforceMembers] Fetching ${metadataType} via Metadata API`);
            return this._fetchViaMetadataAPI(org, metadataType);
        }
    }

    /**
     * Check if a metadata type should use Tooling API
     * @param {string} type - Metadata type name
     * @returns {boolean} True if should use Tooling API
     */
    isToolingType(type) {
        // Only Apex and Lightning component types are reliably supported via Tooling API
        // All other metadata types should use Metadata API listMetadata
        return [
            'ApexClass',
            'ApexTrigger',
            'ApexComponent',
            'ApexPage',
            'LightningComponentBundle',
            'AuraDefinitionBundle'
        ].includes(type);
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Require authentication
     * @private
     */
    async _requireAuth() {
        const org = await this.connector.checkAuth();
        if (!org.isAuthenticated) {
            throw new Error('Not authenticated to Salesforce');
        }
        if (!org.sessionId || !org.instanceUrl) {
            throw new Error('Missing session info - please re-authenticate');
        }
        return org;
    }

    /**
     * Fetch members via Tooling API
     * @private
     */
    async _fetchViaToolingAPI(org, metadataType) {
        // Map metadata type to Tooling object
        const toolingObjectMap = {
            ApexClass: 'ApexClass',
            ApexTrigger: 'ApexTrigger',
            ApexComponent: 'ApexComponent',
            ApexPage: 'ApexPage',
            LightningComponentBundle: 'LightningComponentBundle',
            AuraDefinitionBundle: 'AuraDefinitionBundle'
        };

        const toolingObject = toolingObjectMap[metadataType];
        if (!toolingObject) {
            throw new Error(`Tooling API mapping not found for ${metadataType}`);
        }

        const query = `SELECT Name FROM ${toolingObject} ORDER BY Name`;
        const url = `${org.instanceUrl}/services/data/v${this.apiVersion}/tooling/query/?q=${encodeURIComponent(query)}`;

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${org.sessionId}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Tooling API error: HTTP ${res.status} - ${text.slice(0, 200)}`);
        }

        const data = await res.json();
        return (data.records || []).map(r => r.Name);
    }

    /**
     * Fetch members via Metadata API (SOAP listMetadata)
     * @private
     */
    async _fetchViaMetadataAPI(org, metadataType) {
        // Build SOAP envelope for listMetadata
        const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${org.sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:listMetadata>
      <met:queries>
        <met:type>${metadataType}</met:type>
      </met:queries>
      <met:asOfVersion>${this.apiVersion}</met:asOfVersion>
    </met:listMetadata>
  </soapenv:Body>
</soapenv:Envelope>`;

        const url = `${org.instanceUrl}/services/Soap/m/${this.apiVersion}`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml',
                'SOAPAction': 'listMetadata'
            },
            body: soapBody
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Metadata API error: HTTP ${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
        }

        const xmlText = await res.text();

        // Parse XML response to extract fullName values
        // Format: <fullName>ComponentName</fullName>
        const fullNameRegex = /<fullName>([^<]+)<\/fullName>/g;
        const members = [];
        let match;
        
        while ((match = fullNameRegex.exec(xmlText)) !== null) {
            const name = match[1].trim();
            if (name && !members.includes(name)) {
                members.push(name);
            }
        }

        return members;
    }
}

// Export for both CommonJS and ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SalesforceMembers;
}

export default SalesforceMembers;
