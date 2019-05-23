import { Component, OnInit } from '@angular/core';
import { NavController, NavParams } from '@ionic/angular';
import {PopupProvider} from '../../services/popup';
import {Util} from '../../services/Util';
import {Native} from '../../services/Native';
import {WalletManager} from '../../services/WalletManager'
import { Config } from '../../services/Config';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-txdetails',
  templateUrl: './txdetails.page.html',
  styleUrls: ['./txdetails.page.scss'],
})
export class TxdetailsPage implements OnInit {
  public txDetails:any;
  public type:any;
  public masterWalletId:string="1";
  public raw:string;
  public txHash:string;
  public singPublickey = [];
  constructor(public navCtrl: NavController, public route: ActivatedRoute, public popupProvider:PopupProvider,public native:Native,public walletManager:WalletManager) {
    
    this.route.queryParams.subscribe((data)=>{
      this.type = data["type"];
      this.txDetails = JSON.parse(data['content'])['tx'];
      this.masterWalletId = Config.getCurMasterWalletId();
      this.native.info(this.txDetails);
      this.walletManager.decodeTransactionFromString(this.txDetails["raw"],(raw)=>{
                    if(raw["success"]){
                        this.native.info(raw);
                        this.raw = raw["success"];
                        this.txHash = JSON.parse(raw["success"])["TxHash"];
                        this.txDetails["address"] =JSON.parse(raw["success"])["Outputs"][0]["Address"];
                        this.txDetails["amount"] = JSON.parse(raw["success"])["Outputs"][0]["Amount"]/Config.SELA;
                        this.getTransactionSignedSigners(this.masterWalletId,this.txDetails["chianId"],this.raw);
                    }
      });
    });
    
  }

  ngOnInit() {
    console.log('ngOnInit TxdetailsPage');
  }

  nextPage(){
     if(this.type === 4){
        this.getPassWord();
     }else if(this.type === 3){
        this.native.showLoading().then(()=>{
          this.sendTx(this.masterWalletId,this.txDetails["chianId"],this.raw);
        })
     }
  }

  getPassWord(){
    this.popupProvider.presentPrompt().then((data)=>{
     if(Util.isNull(data)){
       this.native.toast_trans("text-id-kyc-prompt-password");
       return;
     }

     this.singTx(this.masterWalletId,this.txDetails["chianId"],this.raw,data.toString());

    }).catch(err=>{
      alert(JSON.stringify(err));
    })
  }

  singTx(masterWalletId:string,chain:string,rawTransaction:string,payPassWord:string){
    this.walletManager.signTransaction(masterWalletId,chain,rawTransaction,payPassWord,(data)=>{
              if(data["success"]){
                this.native.info(data);
                this.walletManager.encodeTransactionToString(data["success"],(raw)=>{
                             if(raw["success"]){
                              this.native.Go(this.navCtrl, "/scancode", {"tx":{"chianId":this.txDetails["chianId"],"fee":this.txDetails["fee"], "raw": raw["success"]}});
                               }
                });
              }
    })
  }


  sendTx(masterWalletId:string,chain:string,rawTransaction:string){
      this.walletManager.publishTransaction(masterWalletId,chain,rawTransaction,(data)=>{
        if(data["success"]){
          this.native.info(data);
          this.native.hideLoading();
          this.native.toast_trans('send-raw-transaction');
          this.navCtrl.pop();
        }
      })
  }

  getTransactionSignedSigners(masterWalletId:string,chain:string,rawTransaction:string){
        this.walletManager.getTransactionSignedSigners(masterWalletId,chain,rawTransaction,(data)=>{
                           this.native.info(data);
                           if(data["success"]){
                             this.native.info(data["success"]);
                             this.singPublickey = JSON.parse(data["success"])["Signers"];
                             this.native.info(this.singPublickey);
                           }
        });
  }

}
