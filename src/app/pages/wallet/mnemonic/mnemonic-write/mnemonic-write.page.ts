import { Component, OnInit, NgZone } from '@angular/core';
import { Native } from '../../../../services/native.service';
import { Util } from "../../../../model/Util";
import { ActivatedRoute } from '@angular/router';
import { Events } from '@ionic/angular';
import { WalletManager } from '../../../../services/wallet.service';
import { WalletCreationService, SelectableMnemonic } from 'src/app/services/walletcreation.service';

declare let titleBarManager: TitleBarPlugin.TitleBarManager;

@Component({
    selector: 'app-mnemonic-write',
    templateUrl: './mnemonic-write.page.html',
    styleUrls: ['./mnemonic-write.page.scss'],
})
export class MnemonicWritePage implements OnInit {

    mnemonicList: SelectableMnemonic[] = [];
    selectList: Array<any> = [];
    mnemonicStr: string;
    selectComplete = false;

    word1 = "";
    word2 = "";
    word3 = "";
    word4 = "";
    word5 = "";
    word6 = "";
    word7 = "";
    word8 = "";
    word9 = "";
    word10 = "";
    word11 = "";
    word12 = "";


    constructor(
        public route: ActivatedRoute,
        public native: Native,
        public events: Events,
        public walletManager: WalletManager,
        private walletCreationService: WalletCreationService,
        public zone: NgZone
    ) {
        this.mnemonicStr = this.native.clone(this.walletCreationService.mnemonicStr);
        this.mnemonicList = this.native.clone(this.walletCreationService.mnemonicList);
        this.mnemonicList = this.mnemonicList.sort(function(){ return 0.5 - Math.random() });
    }

    ngOnInit() {
        for (let i = 0; i < 12; i++) {
            this.selectList.push(i);
        }
    }

    ionViewWillEnter() {
        titleBarManager.setBackgroundColor('#732cd0');
        titleBarManager.setForegroundMode(TitleBarPlugin.TitleBarForegroundMode.LIGHT);
        titleBarManager.setTitle('Import Wallet');
    }

    async onNext() {
        let mn = "";
        for (let i = 0; i < this.selectList.length; i++) {
            mn += this.selectList[i].text;
        }

        if (!Util.isNull(mn) && mn == this.mnemonicStr.replace(/\s+/g, "")) {
            if (this.walletCreationService.isMulti) {
                this.native.go("/mpublickey");
            }
            else {
                this.native.toast_trans('text-mnemonic-ok');
                await this.native.showLoading();

                await this.walletManager.createNewMasterWallet(
                    this.walletCreationService.masterId, 
                    this.walletCreationService.name,
                    this.mnemonicStr,
                    this.walletCreationService.mnemonicPassword, 
                    this.walletCreationService.payPassword,
                    this.walletCreationService.singleAddress);
            }

        } else {
            this.native.toast_trans('text-mnemonic-prompt3');
        }
    }

    public addButton(index: number, item: any): void {
        var newWord = {
            text: item.text,
            prevIndex: index
        };
        this.zone.run(() => {
            this.selectList.push(newWord);
            this.mnemonicList[index].selected = true;
            this.shouldContinue();
        });
    }

    public removeButton(index: number, item: any): void {
        this.zone.run(() => {
            this.selectList.splice(index, 1);
            this.mnemonicList[item.prevIndex].selected = false;
            this.shouldContinue();
        });
    }

    private shouldContinue(): void {
        this.selectComplete = this.selectList.length === this.mnemonicList.length ? true : false;
    }
}

