import { Component, OnInit } from '@angular/core';
import { Events } from '@ionic/angular';
import { LocalStorage } from '../../../services/storage.service';
import { PopupProvider } from "../../../services/popup.service";
import { WalletManager } from '../../../services/wallet.service';
import { Native } from '../../../services/native.service';
import { ActivatedRoute } from '@angular/router';
import { Config } from "../../../config/Config";
import { AppService } from 'src/app/services/app.service';

@Component({
    selector: 'app-wallet-settings',
    templateUrl: './wallet-settings.page.html',
    styleUrls: ['./wallet-settings.page.scss'],
})
export class WalletSettingsPage implements OnInit {
    walletName = "";
    masterWalletId: string = "1";
    public currentLanguageName: string = "";
    public readonly: string = "";
    public masterWalletType: string = "";
    public singleAddress: boolean = false;

    Config = Config;

    constructor(public route: ActivatedRoute, public events: Events,
                public localStorage: LocalStorage, public popupProvider: PopupProvider, 
                public walletManager: WalletManager, public native: Native,
                private appService: AppService) {
        this.masterWalletId = Config.modifyId;
        this.getMasterWalletBasicInfo();
    }

    ngOnInit() {
    }

    ionViewWillEnter() {
        // update walletName when modify name
        this.walletName = this.walletManager.masterWallets[this.masterWalletId].name;

        this.appService.setBackKeyVisibility(true);
        this.appService.setTitleBarTitle("text-wallet-manager");
    }

    async onDelete() {
        let data = await this.popupProvider.ionicConfirm('confirmTitle', 'confirmSubTitle');
        if (data) {
            await this.destroyWallet(this.masterWalletId);
        }
    }

    public destroyWallet(id: string) {
        this.walletManager.destroyMasterWallet(id);
    }

    private async getMasterWalletBasicInfo() {
        let ret = await this.walletManager.spvBridge.getMasterWalletBasicInfo(this.masterWalletId);

        this.masterWalletType = ret["Type"];
        this.singleAddress = ret["SingleAddress"];
        this.readonly = ret["InnerType"] || "";
    }
}