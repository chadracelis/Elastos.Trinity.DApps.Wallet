import { Component, OnInit } from '@angular/core';
import { AppService } from '../../../services/app.service';
import { Config } from '../../../config/Config';
import { WalletManager } from '../../../services/wallet.service';
import { Native } from '../../../services/native.service';
import { PopupProvider } from '../../../services/popup.service';
import { IntentService } from 'src/app/services/intent.service';

type ClaimRequest = {
    name: string,
    value: string,
    reason: string // Additional usage info string provided by the caller
};

@Component({
    selector: 'app-access',
    templateUrl: './access.page.html',
    styleUrls: ['./access.page.scss'],
})
export class AccessPage implements OnInit {
    Config = Config;

    requestDapp: any = null;
    masterWalletId = '1';
    exportMnemonic = false;
    elaAddress: string = null;
    chainId = 'ELA';
    reason = '';
    title = '';

    requestItems: ClaimRequest[] = [];

    constructor(public appService: AppService,
                private intentService: IntentService,
                public walletManager: WalletManager,
                public popupProvider: PopupProvider,
                public native: Native) { }

    ngOnInit() {
        this.init();
    }

    init() {
        this.requestDapp = Config.requestDapp;
        this.masterWalletId = this.walletManager.getCurMasterWalletId();
        if (this.requestDapp.action === 'walletaccess') {
            this.organizeRequestedFields();
            this.title = 'access-walletinfo';
        } else {
            this.exportMnemonic = true;
            this.title = 'access-mnemonic';
        }
    }

    async organizeRequestedFields() {
        console.log('organizeRequestedFields:', this.requestDapp.requestFields);
        for (const key of Object.keys(this.requestDapp.requestFields)) {
            console.log('key:', key);
            const claim = this.requestDapp.requestFields[key];
            const claimValue = await this.getClaimValue(key);
            const claimRequest: ClaimRequest = {
                name: key,
                value: claimValue,
                reason: ''
            };

            this.requestItems.push(claimRequest);
        }
    }

    claimReason(claimValue: any): string {
        if (claimValue instanceof Object) {
            return claimValue.reason || null;
        }
        return null;
    }

    async getClaimValue(key) {
        let value = '';
        switch (key) {
            case 'elaaddress':
                value = await this.createAddress();
                break;
            case 'elaamount':
                // for now just return the amount of ELA Chain, not include IDChain
                value = this.walletManager.activeMasterWallet.subWallets.ELA.balance.toString();
                break;
            default:
                break;
        }
        return value;
    }

    async createAddress() {
        this.elaAddress = await this.walletManager.spvBridge.createAddress(this.masterWalletId, this.chainId);
        return this.elaAddress;
    }

    reduceArrayToDict(keyProperty: string) {
        let key: string;
        return (acc, curr, index, array) => {
            acc = acc || {};
            key = curr[keyProperty];
            acc[key] = curr.value;
            return acc;
        };
    }

    buildDeliverableList() {
        const selectedClaim = [];
        const mandatoryDict = this.requestItems.reduce(this.reduceArrayToDict('name'), {});
        selectedClaim.push(mandatoryDict);

        console.log('selectedClaim:', selectedClaim);
        return selectedClaim;
    }

    /**
     * Cancel the vote operation. Closes the screen and goes back to the calling application after
     * sending the intent response.
     */
    cancelOperation() {
        this.intentService.sendIntentResponse(this.requestDapp.action, { elaaddress: null }, this.requestDapp.intentId);
        this.native.setRootRouter('/wallet-home/wallet-tab-home');
    }

    onShare() {
        if (this.exportMnemonic) {
            this.native.go('/exportmnemonic', { fromIntent: true });
        } else {
            const selectedClaim = this.buildDeliverableList();
            this.intentService.sendIntentResponse(this.requestDapp.action,
                    {walletinfo: selectedClaim}, this.requestDapp.intentId);
            this.native.setRootRouter('/wallet-home/wallet-tab-home');
        }
    }
}
