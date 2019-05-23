import { Component, OnInit } from '@angular/core';
import { NavController, NavParams} from '@ionic/angular';
import { WalletManager } from '../../../services/WalletManager';
import { Config } from '../../../services/Config';
import { Native } from '../../../services/Native';
import { ActivatedRoute } from '@angular/router';
import { Util } from "../../../services/Util";
import { LocalStorage } from '../../../services/Localstorage';

@Component({
  selector: 'app-exprot-prikey',
  templateUrl: './exprot-prikey.page.html',
  styleUrls: ['./exprot-prikey.page.scss'],
})
export class ExprotPrikeyPage implements OnInit {
  masterWalletId:string ="1";
  public readonly:string="";
  public masterWalletType:string = "";
  public singleAddress:boolean = false;
  constructor(public navCtrl: NavController, public route: ActivatedRoute, public walletManager: WalletManager,public native: Native,public localStorage:LocalStorage) {
           this.onWalletDatainit();
  }

  ngOnInit() {
  }

  public backupWalletPlainText:any;
  exprotObj = {
    name: '',
    backupPassWord: '',
    reBackupPassWord: '',
    payPassword: ''
  };
  public account:any={};
  onWalletDatainit(){
    this.masterWalletId = Config.getCurMasterWalletId();
    this.exprotObj.name = Config.getWalletName(this.masterWalletId);
    this.account = Config.getAccountType(this.masterWalletId);
    this.getMasterWalletBasicInfo();
  }

  checkparms(){

    if(Util.isNull(this.exprotObj.backupPassWord)){
       this.native.toast_trans("text-wallet-pwd");
       return false;
    }

    if(this.exprotObj.backupPassWord != this.exprotObj.reBackupPassWord){
      this.native.toast_trans("text-passworld-compare");
       return false;
    }

    if(Util.isNull(this.exprotObj.payPassword)&&(this.readonly!="Readonly")){
      this.native.toast_trans("text-pay-passworld-input");
      return false;
    }

    if(this.readonly==="Readonly"){
      this.exprotObj.payPassword ="s12345678";
    }

     return true;
  }

  onDown() {
     if(this.checkparms()){
         this.onExport();
     }
  }

  onExport() {
    this.walletManager.exportWalletWithKeystore(this.masterWalletId,this.exprotObj.backupPassWord,this.exprotObj.payPassword,(data) => {
                 if(data["success"]){
                  this.backupWalletPlainText = data["success"];
                 }
    });
  }

  onCopay(){
    this.native.copyClipboard(this.backupWalletPlainText).then(()=>{
      this.native.toast_trans('text-copied-to-clipboard');
    }).catch(()=>{

    });
  }

  getMasterWalletBasicInfo(){
    this.walletManager.getMasterWalletBasicInfo(this.masterWalletId,(data)=>{
      if(data["success"]){
         this.native.info(data);
         let item = JSON.parse(data["success"])["Account"];
         this.masterWalletType = item["Type"] ;
         this.singleAddress = item["SingleAddress"];
         this.readonly = item["InnerType"] || "";
      }
    });
  }

}
