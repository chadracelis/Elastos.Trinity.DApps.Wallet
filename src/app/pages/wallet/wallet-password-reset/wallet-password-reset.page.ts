import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { Config } from '../../../config/Config';
import { Native } from '../../../services/native.service';
import { PopupProvider} from '../../../services/popup.Service';
import { Util } from '../../../model/Util';
import { WalletManager } from '../../../services/wallet.service';

@Component({
    selector: 'app-wallet-password-reset',
    templateUrl: './wallet-password-reset.page.html',
    styleUrls: ['./wallet-password-reset.page.scss'],
})
export class WalletPasswordResetPage implements OnInit {
    masterWalletId = '';
    oldPayPassword = '';
    payPassword: string;
    rePayPassword: string;

    public useFingerprintAuthentication: boolean = false;
    public fingerprintPluginAuthenticationOnGoing: boolean = false;
    public fingerprintAuthenticationIsAvailable: boolean = false;

    constructor(public route: ActivatedRoute,
                public walletManager: WalletManager,
                private authService: AuthService,
                public popupProvider: PopupProvider,
                public native: Native) {
        this.masterWalletId = Config.modifyId;
    }

    ngOnInit() {
    }

    async ionViewWillEnter() {
        this.fingerprintAuthenticationIsAvailable = await this.authService.fingerprintIsAvailable();
        if (this.fingerprintAuthenticationIsAvailable) {
            this.useFingerprintAuthentication = await this.authService.fingerprintAuthenticationEnabled(this.masterWalletId);
        } else {
            this.useFingerprintAuthentication = false;
        }
    }

    async onSubmit() {
        if (!Util.password(this.payPassword)) {
            this.native.toast_trans("text-pwd-validator");
            return;
        }
        if (this.payPassword !== this.rePayPassword) {
            this.native.toast_trans("text-repwd-validator");
            return;
        }

        // Reset pay password
        await this.walletManager.changePassword(this.masterWalletId, this.oldPayPassword, this.payPassword);
        if (this.useFingerprintAuthentication) {
            this.promptFingerprintActivation();
        } else {
            this.native.toast_trans("reset-pwd-success");
            this.native.pop();
        }
    }

    promptFingerprintActivation() {
        this.popupProvider.ionicConfirm('confirmTitle', 'update-fingerprint-title').then(async (data) => {
            if (data) {
                this.fingerprintPluginAuthenticationOnGoing = true;

                // User agreed to activate fingerprint authentication. We ask the auth service to
                // save the typed password securely using the fingerprint.
                const couldActivate = await this.authService.activateFingerprintAuthentication(this.masterWalletId, this.payPassword);
                this.fingerprintPluginAuthenticationOnGoing = false;
                this.useFingerprintAuthentication = couldActivate;
                if (couldActivate) {
                    this.native.toast_trans("reset-pwd-success");
                    this.native.pop();
                } else {
                    // Failed to activate
                }
            }
        });
    }

    async promptFingerprintAuthentication() {
        this.fingerprintPluginAuthenticationOnGoing = true;
        this.oldPayPassword = await this.authService.authenticateByFingerprintAndGetPassword(this.masterWalletId);
        this.fingerprintPluginAuthenticationOnGoing = false;
        if (!this.oldPayPassword) {
            this.oldPayPassword = '';
        }
    }

    async disableFingerprintAuthentication() {
        this.useFingerprintAuthentication = false;
        await this.authService.deactivateFingerprintAuthentication(this.masterWalletId);
    }

}
