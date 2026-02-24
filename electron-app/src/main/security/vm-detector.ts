/**
 * VM Detector
 *
 * Detects if the application is running in a virtual machine or virtualized environment.
 * Uses multiple detection methods for higher confidence.
 */

import si from 'systeminformation';
import { VMDetectionResult, VMType } from '../../shared/types.js';
import { VM_MAC_PREFIXES, VM_BIOS_STRINGS } from '../../shared/constants.js';

export class VMDetector {
  /**
   * Run comprehensive VM detection
   */
  async detect(): Promise<VMDetectionResult> {
    const detectionMethods: string[] = [];
    let vmType: VMType = 'none';
    let isVM = false;

    // Method 1: Check MAC addresses
    const macResult = await this.checkMacAddresses();
    if (macResult.isVM) {
      isVM = true;
      vmType = macResult.vmType;
      detectionMethods.push('mac_address');
    }

    // Method 2: Check system manufacturer and model
    const systemResult = await this.checkSystemInfo();
    if (systemResult.isVM) {
      isVM = true;
      if (vmType === 'none' || vmType === 'unknown') {
        vmType = systemResult.vmType;
      }
      detectionMethods.push('system_info');
    }

    // Method 3: Check BIOS information
    const biosResult = await this.checkBiosInfo();
    if (biosResult.isVM) {
      isVM = true;
      if (vmType === 'none' || vmType === 'unknown') {
        vmType = biosResult.vmType;
      }
      detectionMethods.push('bios_info');
    }

    // Calculate confidence based on number of detection methods
    const confidence = detectionMethods.length / 3;

    return {
      isVM,
      vmType,
      confidence,
      detectionMethods,
    };
  }

  /**
   * Check MAC addresses for VM vendor prefixes
   */
  private async checkMacAddresses(): Promise<{ isVM: boolean; vmType: VMType }> {
    try {
      const networkInterfaces = await si.networkInterfaces();

      for (const iface of networkInterfaces) {
        if (!iface.mac) continue;

        const mac = iface.mac.toUpperCase().replace(/-/g, ':');
        const macPrefix = mac.substring(0, 8); // First 3 octets (e.g., "00:0C:29")

        // Check against known VM MAC prefixes
        for (const [vendor, prefixes] of Object.entries(VM_MAC_PREFIXES)) {
          for (const prefix of prefixes) {
            if (macPrefix === prefix) {
              return {
                isVM: true,
                vmType: vendor as VMType,
              };
            }
          }
        }
      }

      return { isVM: false, vmType: 'none' };
    } catch (error) {
      console.error('Error checking MAC addresses:', error);
      return { isVM: false, vmType: 'none' };
    }
  }

  /**
   * Check system manufacturer and model for VM indicators
   */
  private async checkSystemInfo(): Promise<{ isVM: boolean; vmType: VMType }> {
    try {
      const system = await si.system();

      const manufacturer = (system.manufacturer || '').toLowerCase();
      const model = (system.model || '').toLowerCase();
      const version = (system.version || '').toLowerCase();

      const combinedInfo = `${manufacturer} ${model} ${version}`;

      // Check for VM indicators
      if (combinedInfo.includes('vmware')) {
        return { isVM: true, vmType: 'vmware' };
      }
      if (combinedInfo.includes('virtualbox') || combinedInfo.includes('vbox')) {
        return { isVM: true, vmType: 'virtualbox' };
      }
      if (combinedInfo.includes('microsoft') && combinedInfo.includes('virtual')) {
        return { isVM: true, vmType: 'hyperv' };
      }
      if (combinedInfo.includes('parallels')) {
        return { isVM: true, vmType: 'parallels' };
      }
      if (combinedInfo.includes('qemu')) {
        return { isVM: true, vmType: 'qemu' };
      }
      if (combinedInfo.includes('xen')) {
        return { isVM: true, vmType: 'xen' };
      }

      // Check for generic VM indicators
      for (const vmString of VM_BIOS_STRINGS) {
        if (combinedInfo.includes(vmString)) {
          return { isVM: true, vmType: 'unknown' };
        }
      }

      return { isVM: false, vmType: 'none' };
    } catch (error) {
      console.error('Error checking system info:', error);
      return { isVM: false, vmType: 'none' };
    }
  }

  /**
   * Check BIOS information for VM indicators
   */
  private async checkBiosInfo(): Promise<{ isVM: boolean; vmType: VMType }> {
    try {
      const bios = await si.bios();

      const vendor = (bios.vendor || '').toLowerCase();
      const version = (bios.version || '').toLowerCase();
      const releaseDate = (bios.releaseDate || '').toLowerCase();

      const combinedInfo = `${vendor} ${version} ${releaseDate}`;

      // Check for VM indicators in BIOS
      if (combinedInfo.includes('vmware')) {
        return { isVM: true, vmType: 'vmware' };
      }
      if (combinedInfo.includes('virtualbox') || combinedInfo.includes('vbox')) {
        return { isVM: true, vmType: 'virtualbox' };
      }
      if (combinedInfo.includes('hyper-v') || combinedInfo.includes('microsoft corporation')) {
        return { isVM: true, vmType: 'hyperv' };
      }
      if (combinedInfo.includes('parallels')) {
        return { isVM: true, vmType: 'parallels' };
      }
      if (combinedInfo.includes('qemu')) {
        return { isVM: true, vmType: 'qemu' };
      }
      if (combinedInfo.includes('xen')) {
        return { isVM: true, vmType: 'xen' };
      }

      // Check for generic VM indicators
      for (const vmString of VM_BIOS_STRINGS) {
        if (combinedInfo.includes(vmString)) {
          return { isVM: true, vmType: 'unknown' };
        }
      }

      return { isVM: false, vmType: 'none' };
    } catch (error) {
      console.error('Error checking BIOS info:', error);
      return { isVM: false, vmType: 'none' };
    }
  }

  /**
   * Get detailed system information for debugging
   */
  async getSystemDetails(): Promise<{
    system: si.Systeminformation.SystemData;
    bios: si.Systeminformation.BiosData;
    networkInterfaces: si.Systeminformation.NetworkInterfacesData[];
  }> {
    try {
      const [system, bios, networkInterfaces] = await Promise.all([
        si.system(),
        si.bios(),
        si.networkInterfaces(),
      ]);

      return {
        system,
        bios,
        networkInterfaces,
      };
    } catch (error) {
      console.error('Error getting system details:', error);
      throw error;
    }
  }
}
