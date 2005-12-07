/*
 * ***** BEGIN LICENSE BLOCK *****
 * Version: ZPL 1.1
 * 
 * The contents of this file are subject to the Zimbra Public License
 * Version 1.1 ("License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.zimbra.com/license
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See
 * the License for the specific language governing rights and limitations
 * under the License.
 * 
 * The Original Code is: Zimbra Collaboration Suite.
 * 
 * The Initial Developer of the Original Code is Zimbra, Inc.
 * Portions created by Zimbra are Copyright (C) 2005 Zimbra, Inc.
 * All Rights Reserved.
 * 
 * Contributor(s):
 * 
 * ***** END LICENSE BLOCK *****
 */

/**
* Create a new, empty appt list.
* @constructor
* @class
* This class represents a list of appts.
*
*/
function ZmRoster(appCtxt) {
    ZmModel.call(this, true);
    this._appCtxt = appCtxt;
    this._newRosterItemtoastFormatter = new AjxMessageFormat(ZmMsg.imNewRosterItemToast);	
    this.getRosterItemTree(); // pre-create
   	this._evt = new ZmEvent(ZmEvent.S_ROSTER);
	this._presenceToastFormatter = new AjxMessageFormat(ZmMsg.imStatusToast);   	
}

ZmRoster.prototype = new ZmModel;
ZmRoster.prototype.constructor = ZmRoster;

ZmRoster.F_PRESENCE = "ZmRoster.presence";

ZmRoster.prototype.toString = 
function() {
	return "ZmRoster";
}

ZmRoster.prototype.getChatList =
function() {
	if (!this._chatList)
		this._chatList = new ZmChatList(this._appCtxt);
	return this._chatList;
};

ZmRoster.prototype.getRosterItemTree =
function() {
	if (!this._rosterItemTree) {
   		this._rosterItemTree = new ZmFolderTree(this._appCtxt, ZmOrganizer.ROSTER_TREE_ITEM);
    		this._appCtxt.setTree(ZmOrganizer.ROSTER_TREE_ITEM, this._rosterItemTree);
	}
	return this._rosterItemTree;
};

ZmRoster.prototype.getRosterItemList =
function() {
	if (!this._rosterItemList) {
		this._rosterItemList = new ZmRosterItemList(this._appCtxt);
	}
	return this._rosterItemList;
};

ZmRoster.prototype.getPresence =
function() {
	if (!this._rosterPresence) {
   		this._rosterPresence = new ZmRosterPresence();
	}
	return this._rosterPresence;
};

ZmRoster.prototype._handleGetRosterResponse =
function(args) {
    var resp = args.getResponse()
    if (!resp || !resp.IMGetRosterResponse) return;
    var roster = resp.IMGetRosterResponse;
    var list = this.getRosterItemList();
    if (roster.items && roster.items.item) {
        var items = roster.items.item;
        for (var i=0; i < items.length; i++) {
            var item = items[i];
            if (item.subscription == "TO" || item.subscription == "BOTH") {
                // TODO: handle item.presence
                var rp = new ZmRosterPresence();
                rp.setFromJS(item.presence);
                var rosterItem = new ZmRosterItem(item.addr, list, this._appCtxt, item.name, rp, item.groups);
                list.addItem(rosterItem);
            }
        }        
    }
    if (roster.presence) {
        this.getPresence().setFromJS(roster.presence);
        this._notifyPresence();
    }
};

ZmRoster.prototype._notifyPresence =
function() {
    var fields = {};
    fields[ZmRoster.F_PRESENCE] = this.getPresence();
    this._eventNotify(ZmEvent.E_MODIFY, {fields: fields});
};

ZmRoster.prototype.reload =
function() {
    this.getRosterItemList().removeAllItems();
    var soapDoc = AjxSoapDoc.create("IMGetRosterRequest", "urn:zimbraIM");
    var callback = new AjxCallback(this, this._handleGetRosterResponse);
	this._appCtxt.getAppController().sendRequest(soapDoc, true, callback);
};

/**
 * create item on server.
 */
ZmRoster.prototype.createRosterItem =
function(addr, name, groups) {
    var soapDoc = AjxSoapDoc.create("IMSubscribeRequest", "urn:zimbraIM");
    var method = soapDoc.getMethod();
	method.setAttribute("addr", addr);    
	if (name) method.setAttribute("name", name);
	if (groups) method.setAttribute("groups", groups);
	method.setAttribute("op", "add");
	this._appCtxt.getAppController().sendRequest(soapDoc, true);
};

/**
 * set presence on the server
 */
ZmRoster.prototype.setPresence =
function(show, priority, showStatus) {
    var soapDoc = AjxSoapDoc.create("IMSetPresenceRequest", "urn:zimbraIM");
    var presence = soapDoc.set("presence");
	presence.setAttribute("show", show);
	if (priority) presence.setAttribute("priority", priority);
	if (showStatus) soapDoc.set("status", showStatus, presence);	
	this._appCtxt.getAppController().sendRequest(soapDoc, true);
};

/**
 * handle async notifications. we might need to queue this with timed action and return
 * immediately, since this is happening as a result of a notify header in a response, and
 * we probably don't want to trigger more requests while handling a response.
 */
ZmRoster.prototype.handleNotification =
function(im) {
    // do subscribes/unsubscribes before presence...
    if (im.subscribed) {
        for (var i=0; i < im.subscribed.length; i++) {
            var sub = im.subscribed[i];
            if (sub.to) {
                var list = this.getRosterItemList();
                var item = list.getByAddr(sub.to);
                if (item) {
                    if (sub.groups) item._notifySetGroups(sub.groups); // should optimize
                    if (sub.name && sub.name != item.getName()) item._notifySetName(sub.name);
                    // mod
                } else {
                    // create
                    var item = new ZmRosterItem(sub.to, list, this._appCtxt, sub.name, null, sub.groups);
                    list.addItem(item);
                    var toast = this._newRosterItemtoastFormatter.format([item.getName()]);
                    this._appCtxt.setStatusMsg(toast, null, null, null, ZmStatusView.TRANSITION_SLIDE_LEFT);
                }
            } else if (sub.from) {
                // toast, should we user if they want to add user if they aren't in buddy list?
            }
        }
    }
    if (im.unsubscribed) {
        for (var i=0; i < im.unsubscribed.length; i++) {
            var unsub = im.unsubscribed[i];
            if (unsub.to) {
                var list = this.getRosterItemList();
                var item = list.getByAddr(unsub.to);
                if (item) list.removeItem(item);
            }
        }
    }
    if (im.presence) {
        var me = this._appCtxt.get(ZmSetting.USERNAME);
        for (var i=0; i < im.presence.length; i++) {
            var p = im.presence[i];
            if (p.from == me) {
                this.getPresence().setFromJS(p);
                this._notifyPresence();            
            } else {
                var ri = this.getRosterItemList().getByAddr(p.from);
                if (ri) {
                    ri.getPresence().setFromJS(p);
                    ri._notifyPresence();
                    var toast = this._presenceToastFormatter.format([ri.getName(), ri.getPresence().getShowText()]);
                    this._appCtxt.setStatusMsg(toast, null, null, null, ZmStatusView.TRANSITION_SLIDE_LEFT);
                }
            }
        }
    }
};

ZmRoster.prototype._eventNotify =
function(event, details) {
	if (this._evtMgr.isListenerRegistered(ZmEvent.L_MODIFY)) {
		this._evt.set(event, this);
		this._evt.setDetails(details);
		this._evtMgr.notifyListeners(ZmEvent.L_MODIFY, this._evt);
	}
};
