import { Component, OnInit } from '@angular/core';
import { Events } from '@ionic/angular';
import { LocalStorage } from '../../../services/storage.service';
import { PopupProvider } from "../../../services/popup.service";
import { WalletManager } from '../../../services/wallet.service';
import { Native } from '../../../services/native.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Util } from 'src/app/model/Util';
import { Config } from 'src/app/config/Config';
import { AppService } from 'src/app/services/app.service';
import { WalletEditionService } from 'src/app/services/walletedition.service';
import { ThemeService } from 'src/app/services/theme.service';
import { MasterWallet } from 'src/app/model/wallets/MasterWallet';
import { TranslateService } from '@ngx-translate/core';
import { CurrencyService } from 'src/app/services/currency.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
    selector: 'app-wallet-settings',
    templateUrl: './wallet-settings.page.html',
    styleUrls: ['./wallet-settings.page.scss'],
})
export class WalletSettingsPage implements OnInit {

    public masterWallet: MasterWallet;

    public walletName = "";
    private masterWalletId = "1";
    public masterWalletType = "";

    public singleAddress = false;

    public currentLanguageName = "";
    public readonly = "";

    // Helpers
    public Util = Util;
    public SELA = Config.SELA;

    public settings = [
        {
            type: 'wallet-export',
            // route: "/mnemonic-export",
            route: null,
            title: this.translate.instant("wallet-settings-backup-wallet"),
            subtitle: this.translate.instant("wallet-settings-backup-wallet-subtitle"),
            icon: '/assets/settings/key.svg',
            iconDarkmode: '/assets/settings/darkmode/key.svg'
        },
        {
            type: 'wallet-name',
            route: "/wallet-edit-name",
            title: this.translate.instant("wallet-settings-change-name"),
            subtitle: this.translate.instant("wallet-settings-change-name-subtitle"),
            icon: '/assets/settings/pen.svg',
            iconDarkmode: '/assets/settings/darkmode/pen.svg'
        },
        {
            type: 'wallet-color',
            route: "/wallet-color",
            title: this.translate.instant("wallet-settings-change-theme"),
            subtitle: this.translate.instant("wallet-settings-change-theme-subtitle"),
            icon: '/assets/settings/picture.svg',
            iconDarkmode: '/assets/settings/darkmode/picture.svg'
        },
        // TODO delete wallet-password-reset
        // {
        //     route: "/wallet-password-reset",
        //     title: "Change Password",
        //     subtitle: "Change your wallets secure pay password",
        //     icon: '/assets/settings/lock.svg',
        //     iconDarkmode: '/assets/settings/darkmode/lock.svg'
        // },
        {
            type: 'coin-list',
            route: "/coin-list",
            title: this.translate.instant("wallet-settings-manage-coin-list"),
            subtitle: this.translate.instant("wallet-settings-manage-coin-list-subtitle"),
            icon: '/assets/settings/coins.svg',
            iconDarkmode: '/assets/settings/darkmode/coins.svg'
        },
        {
            type: 'wallet-delete',
            route: null,
            title: this.translate.instant("wallet-settings-delete-wallet"),
            subtitle: this.translate.instant("wallet-settings-delete-wallet-subtitle"),
            icon: '/assets/settings/trash.svg',
            iconDarkmode: '/assets/settings/darkmode/trash.svg'
        },
    ];

    constructor(
        public route: ActivatedRoute,
        public router: Router,
        public events: Events,
        public localStorage: LocalStorage,
        public popupProvider: PopupProvider,
        public walletManager: WalletManager,
        public native: Native,
        private translate: TranslateService,
        private walletEditionService: WalletEditionService,
        private appService: AppService,
        public theme: ThemeService,
        public currencyService: CurrencyService,
        private authService: AuthService,
    ) {
    }

    ngOnInit() {
        this.masterWalletId = this.walletEditionService.modifiedMasterWalletId;
        this.masterWallet = this.walletManager.getMasterWallet(this.masterWalletId);
        console.log('Settings for master wallet - ' + this.masterWallet);
        this.getMasterWalletBasicInfo();
    }

    ionViewWillEnter() {
        // Update walletName when modify name
        this.walletName = this.walletManager.masterWallets[this.masterWalletId].name;

        this.appService.setBackKeyVisibility(true);
        this.appService.setTitleBarTitle("wallet-settings-title");
    }

    async getPassword() {
        try {
            const payPassword = await this.authService.getWalletPassword(this.masterWalletId, true, true);
            if (payPassword) {
                this.native.go('/mnemonic-export', { payPassword: payPassword });
            }
        } catch (e) {
            console.error('MnemonicExportPage getWalletPassword error:' + e);
        }
    }

    async onDelete() {
        try {
            const payPassword = await this.authService.getWalletPassword(this.masterWalletId, true, true);
            if (payPassword) {
                const confirmToDelete = await this.popupProvider.ionicConfirm('delete-wallet-confirm-title', 'delete-wallet-confirm-subtitle');
                if (confirmToDelete) {
                    await this.destroyWallet(this.masterWalletId);
                }
            }
        } catch (e) {
            console.error('onDelete getWalletPassword error:' + e);
        }
    }

    public async destroyWallet(id: string) {
        await this.walletManager.destroyMasterWallet(id);

        this.events.publish("masterwalletcount:changed", {
            action: 'remove',
        });
    }

    private async getMasterWalletBasicInfo() {
        console.log("2", this.masterWalletId);
        let ret = await this.walletManager.spvBridge.getMasterWalletBasicInfo(this.masterWalletId);

        this.masterWalletType = ret["Type"];
        this.singleAddress = ret["SingleAddress"];
        this.readonly = ret["InnerType"] || "";
    }

  /*   public goToSetting(item) {
        item.route !== null ? this.native.go(item.route) : this.onDelete();
    } */

    public goToSetting(item) {
        if (item.type === 'wallet-export') {
            this.getPassword();
        } else if (item.type === 'wallet-delete') {
            this.onDelete();
        } else {
            this.native.go(item.route);
        }
    }
}
