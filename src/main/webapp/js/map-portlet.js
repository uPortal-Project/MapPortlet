/*  MAPS PORTLET
 *  This is all the JavaScript that controls the Google Maps Portlet.
 *  All Google methods are contained in MapPortlet.MapView.gmaps.
 *  Backbone is used for models, and views. Neither the Backbone router or JQueryMobile router is used.
 *  Underscore is a dependency of Backbone and also handles templating.
 *  Backbone Layout Manager allows for multiple Backbone Views per screen.
 */

MapPortlet= function ( $, _, Backbone, google, options ) {
  
  // Scope models
  var mapLocations, matchingMapLocations;
  
  // Scope views
  var mapFooterView,        mapSearchFormView, 
      mapSearchResultsView, mapLocationDetailView, 
      mapCategoriesView,    mapCategoryDetailView,
      mapView;
  
  Backbone.LayoutManager.configure({
      manage: true
  });
  
  /* ********************************************** 
   * *** MODELS
   * **********************************************
   */
  
  /* MAP LOCATION *********************************
   * 
   */
  var MapLocation= Backbone.Model.extend({
  
    getCoords : function () {
      var lat= this.get('latitude'),
        lon= this.get('longitude');
      return lat != null && lon != null && { latitude : lat, longitude : lon }
    }
  
  });
  
  
  /* MAP LOCATIONS ********************************
   * 
   */
  var MapLocations= Backbone.Collection.extend({
    model : MapLocation,
  
    defaultLocation : {},
  
    initialize : function (options) {
      this.url= options.url;
    },
  
    parse : function (response) {
      var index= 0, categories= {};
      this.defaultLocation= response.mapData.defaultLocation;
      _.each(response.mapData.locations, function (location) {
        // add id
        location.id= index;
        index += 1;
        // group categories
        if( location.categories ) {
          _.each( location.categories, function (category) {
            if( ! categories.hasOwnProperty(category) ) categories[category]=0;
            categories[category] += 1;
          });
        }
      });
      this.categories= categories;
      return response.mapData.locations;
    },
  
    findById : function (id) {
      var id= parseInt(id, 10);
      return this.find( function (model) {
        return model.get('id') === id;
      });
    },
    
    findByCategory : function (categoryName) {
      return _.filter( this.models, function (model) {
        return model.get('categories') && _.indexOf( model.get('categories'), categoryName ) > -1;
      });
    }
  
  });
  
  
  
  /* MATCHING MAP LOCATIONS ***********************
   * 
   */
  var MatchingMapLocations= Backbone.Collection.extend({
    model: MapLocation,
    defaultLocation : { latitude:1, longitude:2 },
  
    initialize : function () {
      this.on('reset', this.calculateDistances, this);
    },
  
    /* comparator()
     * Always sort by distance. 
     */
    comparator : function (model) {
      return model.get('distance');
    },
  
    calculateDistances : function () {
      var coords, dist, collection= this;
      this.models.forEach( function (model) {
        coords= model.getCoords();
        dist= coords ? collection.calculateDistance( collection.defaultLocation, model.getCoords() ) : -1;
        model.set('distance', dist );
      });
      // Resort now that location is defined. This MUST be silent, or you will cause an infinite loop.
      this.sort({silent:true});
    },
  
    calculateDistance : function (coord1, coord2) {
      var lat1 = this.convertDegToRad(coord1.latitude),
        lon1 = this.convertDegToRad(coord1.longitude),
        lat2 = this.convertDegToRad(coord2.latitude),
        lon2 = this.convertDegToRad(coord2.longitude),
  
        R = 6371, // km
        dLat = lat2-lat1,
        dLon = lon2-lon1,
        a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2),
        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    },
  
    convertDegToRad : function (number) {
      return number * Math.PI / 180;
    }
  
  });
  
  
  
  /* ********************************************** 
   * *** VIEWS
   * **********************************************
   */

  /* SEARCH RESULTS VIEW **************************
   *
   */
  var MapSearchResultsView= Backbone.View.extend({
    template: '#map-search-results-view-template',
    
    events : {
      'click .map-search-result-link' : 'clickResult'
    },
    
    initialize : function (options) {
      this.matchingMapLocations = options.matchingMapLocations;
    },
    
    setSearchQuery : function (q) {
      this.query= q;
    },

    clickResult : function (e) {
      var id= $(e.target).data('locationid');
      this.trigger('clickResult', id)
    },

    serialize : function () {
      return {
        query : this.query,
        results : this.matchingMapLocations.toJSON()
      };
    },
    
    afterRender : function () {
      this.$el.trigger('create');
    }
  });
  
  
  /* MAP VIEW *************************************
   * 
   */
  var MapView= Backbone.View.extend({
    template: '#map-view-template',
    className: 'portlet',

    events : {
      'click .map-link' : 'clickLocation'
    },

    initialize: function (options) {
      this.mapLocations= options.mapLocations
      this.mapLocations
        .on('reset', this.createMap, this);
      this.matchingMapLocations= options.matchingMapLocations;
      this.isVisible= true;
      this.mapOptions= options.mapOptions;
    },

    /* GOOGLE MAPS API
     * The gmaps object should contain all the gmaps-specific API methods for the entire application. 
     */
    gmaps : {
      newMap : function (div, options) {
        return new window.google.maps.Map( div, options );
      },
      latLng : function (latitude, longitude) {
        return new window.google.maps.LatLng(latitude, longitude);
      },
      infoWindow : function () {
        return new window.google.maps.InfoWindow();
      },
      LatLngBounds : function () {
        return new window.google.maps.LatLngBounds();
      },
      marker : function (options) {
        return new window.google.maps.Marker(options);
      },
      addListener : function (target, event, callback) {
        window.google.maps.event.addListener(target, event, callback);
      }
    },

    
    createMap : function () {
      var coords;
      if( ! this.map ) {
        coords= this.mapLocations.defaultLocation;
        latLng= this.gmaps.latLng(coords.latitude, coords.longitude);
        this.mapOptions.center= latLng;
        // TODO: DON'T HARD CODE SELECTORS!
        this.map= this.gmaps.newMap( $('.map-display', this.$el).get(0), this.mapOptions );
        this.infoWindow= this.gmaps.infoWindow();
      }
      return this.map;
    },

    clearMarkers : function () {
      if( this.markers ) {
        _.each(this.markers, function (m) {
          m.setMap(null);
        });
      }
      this.markers= [];
    },

    drawMap : function () {
      var map, infoWindow, point, bounds, markers=[];
      if( ! this.isVisible ) this.$el.show();
      map= this.createMap();
      infoWindow= this.infoWindow;
      this.clearMarkers();
      this.firstLocation= null;
      bounds= this.gmaps.LatLngBounds();
      _.each( this.matchingMapLocations.models, function (loc) {
        var marker, link;
        if( loc.get('distance') > -1 ) {
          point= this.gmaps.latLng( loc.get('latitude'), loc.get('longitude') );
          marker= this.gmaps.marker({
            position:point,
            map:map
          });
          link= $('<a class="map-link"/>')
            .text( loc.get('name') + ' ('+ loc.get('abbreviation') +')' )
            .data('locationId', loc.get('id')).get(0);
          if( ! this.firstLocation ) this.firstLocation= { link:link, marker:marker };
          this.gmaps.addListener(marker, 'click', function () {
            infoWindow.setOptions({ content : link });
            infoWindow.open(map, marker);
          });
          bounds.extend(point);
          markers.push(marker);
        }
      }, this);
      if( markers.length == 1 ) {
        map.setCenter(point);
        // TODO: is this a configuration value?
        map.setZoom(17);
      } else if( markers.length > 0 ) {
        this.map.fitBounds(bounds);
      }
      if( this.firstLocation ) {
        infoWindow.setOptions({ content : this.firstLocation.link });
        this.infoWindow.open( this.createMap(), this.firstLocation.marker );
      }
      this.markers= markers;
      if( ! this.isVisible ) this.$el.hide();
    },

    clickLocation : function (e) {
      e.preventDefault();
      this.trigger('clickLocation', $(e.target).data('locationId') );
    },

    openLocationPoint : function (loc) {
      var $link= $('<a class="map-link"/>')
        .text( loc.get('name') + ' ('+ loc.get('abbreviation') +')' )
        .data('locationId', loc.get('id'));
      this.infoWindow.setOptions({ content : $link.get(0) });
      this.infoWindow.open( this.createMap(), this.markers[0] );
    },

    show : function () {
      this.$el.show();
      this.isVisible= true;
      return this;
    },

    hide : function () {
      this.$el.hide();
      this.isVisible= false;
      return this;
    },
    
    setTop : function (top) {
      this.$el.closest('.map-fullscreen').css('top', top + 'px');
      return this;
    }

  });
  
  /* MAP SEARCH VIEW ******************************
   * 
   */
  var MapSearchFormView= Backbone.View.extend({
    template: '#map-search-form-template',
    className: 'map-search-form',
  
    events : {
      'keypress input[type=text]' : 'submitSearchByEnter'
    },
  
    initialize : function (options) {
      this.mapLocations= options.mapLocations;
      this.mapLocations.fetch().error( function (e) {
        console.log('ERROR WITH LOADING DATA:', e.statusText);
      });
      this.matchingMapLocations= options.matchingMapLocations;
      this.title= '';
    },

    setQuery : function (query) {
      this.query= query;
      this.render();
      return this;
    },

    setTitle : function (title) {
      this.title= title;
      this.render();
      return this;
    },
    
    getHeight : function () {
      var h= 0,
          classes= this.$el.attr('class').split(' ');
      if( _.indexOf(classes, 'map-show-search') != -1 )
        h += mapSearchFormView.$el.find('.map-search-form').outerHeight();
      if( _.indexOf(classes, 'map-show-title') != -1 )
        h += mapSearchFormView.$el.find('.map-title').outerHeight();
      return h;
    },

    showControl : function (control) {
      this.$el.addClass('map-show-'+control);
      return this;
    },

    hideControl : function (control) {
      this.$el.removeClass('map-show-'+control);
      return this;
    },
  
    submitSearch : function (e){
      // do search
      var ff= $(e.target).closest('form').get(0).search;
      this.trigger('submitSearch', ff.value);
    },

    submitSearchByEnter : function (e) {
      if( e.keyCode != 13 ) return;
      this.submitSearch(e);
    },

    search : function (query) {
      var matches;
      if( query ) {
        this.matchingMapLocations.defaultLocation= this.mapLocations.defaultLocation;
        query= query.toLowerCase(query);
        matches= _.filter( this.mapLocations.models, function (location) {
          return (
              location.get('categories').toString().indexOf(query) > -1
            ) || ( 
              location.get('searchText') && location.get('searchText').indexOf(query) > -1
            );
        });
        this.matchingMapLocations.reset(matches);
      }
    },
    
    serialize : function () {
      return { title : this.title };
    },

    afterRender : function () {
      this.$el.trigger('create');
    }

  });
  
  /* MAP LOCATION DETAIL VIEW *********************
   * 
   */
  var MapLocationDetailView= Backbone.View.extend({
    template : '#map-location-detail-template',
    className : 'map-location-detail portlet',
    model : new MapLocation(),
  
    events : {
      'click .map-location-map-link' : 'clickViewInMap'
    },
  
    initialize : function (options) {
      this.matchingMapLocations= options.matchingMapLocations;
      this.model.on('change', function () { this.render(); this.$el.trigger("create"); }, this);
    },
  
    serialize : function () {
      return { location : this.model ? this.model.toJSON() : {} };
    },
  
    clickViewInMap : function () {
      this.matchingMapLocations.reset(this.model);
      this.trigger('clickViewInMap', this.model.get('id'));
    }
  
  });
  
  /* MAP CATEGORIES VIEW **************************
   * 
   */
  var MapCategoriesView= Backbone.View.extend({
    template : '#map-categories-template',
    className : 'map-categories',
    categories : {},
  
    events : {
      'click a.map-category-link' : 'clickCategory'
    },
  
    initialize : function (options) {
      this.mapLocations= options.mapLocations;
      // TODO: Should this run every time mapLocations is reset?
      this.mapLocations.on('reset', function () { this.render(); this.$el.trigger("create"); }, this);
    },
  
    clickCategory : function (e) {
      this.trigger('clickCategory', $(e.target).data('category') );
    },
  
    serialize : function () {
      return { categories : this.mapLocations.categories || {} };
    }

  });
  
  /* MAP CATEGORY DETAIL VIEW *********************
   * 
   */
  var MapCategoryDetailView = Backbone.View.extend({
    template : '#map-category-detail-template',
    events : {
      'click a.map-location-link' : 'clickLocation'
    },
  
    initialize : function (options) {
      this.mapLocations= options.mapLocations;
      this.matchingMapLocations= options.matchingMapLocations;
      this.categoryName= '';
    },
  
    setCategoryName : function (categoryName) {
      var matches= this.mapLocations.findByCategory(categoryName);
      this.matchingMapLocations.reset( matches );
      this.categoryName= categoryName.toString();
    },

    clickLocation : function (e) {
      var id= $(e.target).data('locationid');
      this.trigger('clickLocation', id);
    },
  
    serialize : function () {
      return { 
        categoryName : this.categoryName, 
        locations : this.matchingMapLocations
      };
    }
  
  });



  /* MAP FOOTER VIEW *********************
   * 
   */
  var MapFooterView = Backbone.View.extend({
    template : '#map-footer-template',

    /* tabs: all tabs and if they are enabled */
    tabs : { 'back':false, 'search':true, 'browse':true, 'map':true },
    
    /* EVENTS */
    events : {
      'click a.map-footer-back-link'   : 'clickBack',
      'click a.map-footer-search-link' : 'clickSearch',
      'click a.map-footer-browse-link' : 'clickBrowse',
      'click a.map-footer-map-link'    : 'clickMap'
    },
    click : function (tabName) {
      if( this.tabs[tabName] )
        this.trigger('click-' + tabName);
    },
    clickBack   : function (e) { this.click('back');   },
    clickSearch : function (e) { this.click('search'); },
    clickBrowse : function (e) { this.click('browse'); },
    clickMap    : function (e) { this.click('map');    },
    /* / EVENTS */
    
    getTab : function (tabName) {
      return $('a.map-footer-' + tabName + '-link');
    },

    setNav : function (pageName) {
      _.each(this.tabs, function (tabName) {
        this.getTab(tabName)[ tabName == pageName ? 'addClass' : 'removeClass']('ui-btn-active');
      }, this);
      return this;
    },
    
    bindNavTo : function (tabName, method, context) {
      this.off('click-'+tabName);
      this.on('click-'+tabName, method, context);
      return this;
    },

    enableButton : function (tabName, isEnabled) {
      this.getTab(tabName)[isEnabled ? 'removeClass' : 'addClass']('ui-disabled');
      this.tabs[tabName]=isEnabled;
      return this;
    },

    enableBackButton  : function () { return this.enableButton('back', true);  },
    disableBackButton : function () { return this.enableButton('back', false); },
    enableMapButton   : function () { return this.enableButton('map',  true);  },
    disableMapButton  : function () { return this.enableButton('map',  false); },
    
    afterRender : function () {
      /* Set height of footer footprint. 
       * The footer is fixed at the bottom, setting
       * the footprint height allows scrolling content to clear.
       * jQM already adds padding to the bottom of the page when there is a footer,
       * but it currently isn't enough.
       */
      this.$el.height( this.$el.find('[data-role=footer]').outerHeight() );
    }
    
  });
  
  
  /* ********************************************** 
   * *** PORTLET/ROUTER
   * **********************************************
   */
  if( ! google ) {
    throw new Error( 'Could not connect to the Google Maps API. Please try again.' );
  }
  
  var MapPortletRouter= function () {
    var self= this;
  
    /* showOnly()
     * Hide all views except for the ones passed as a parameter.
     * @param views array - array of view objects that are to be shown
     * Note: MapView is a special case. Google Maps doesn't render well in elements with display:none.
     */
    var showOnly = function (views) {
      var allViews= [mapSearchFormView, mapSearchResultsView, mapLocationDetailView, mapCategoriesView, mapCategoryDetailView];
      if( ! _.isArray(views) ) alert('Error\nshowOnly(): parameter must be an array.');
      _.each( allViews, function (v) {
        v.$el[ _.indexOf(views, v) == -1 ? 'hide' : 'show' ]();
      });
      //mapView[ _.indexOf(views, mapView) == -1 ? 'hide' : 'show' ]();
      self.layout.$el.find('.map-fullscreen')[ _.indexOf(views, mapView) == -1 ? 'hide' : 'show' ]();
      
      mapFooterView.$el.show();
      self.layout.$el.trigger('create');

      // fix resizing
      if( parseInt( self.layout.$el.find('.map-fullscreen').css('bottom'), 10) == 0 ) {
        self.layout.$el.find('.map-fullscreen').css({
          'bottom' : self.layout.$el.find('.map-footer').outerHeight() + 'px'
        });
        $( window ).trigger( "throttledresize" );
      }
      
    };
    
    /* addHistory()
     * Adds a stop to the beginning of an array, truncates to 3 stops.
     * The history is very simple. It is only to allow to go back once.
     * There is no reason to create a full history function.
     * Each stop added to the array is an array where the first item is a function and the other items are arguments.
     * @param function - required
     * @params arguments - optional
     */
    var addHistory = function () {
      var args = Array.prototype.slice.call(arguments);
      if( ! self.hasOwnProperty('_history') ) self._history=[];
      // Add new stop at beginning of array
      self._history.unshift( args );
      // If only 1 stop, disable the back button (should just happen on page load)
      if( self._history.length == 1 )
        mapFooterView.disableBackButton();
      // If more than 1 stop, enable the back button
      else if( self._history.length > 1 )
        mapFooterView.enableBackButton();
    };
    
    var goBack = function () {
      var i= arguments.length > 0 ? arguments[0] : 1, 
          f= self._history[i];
      if( ! f ) return;
      // apply function (first item) with arguments (items after first)
      self._history= self._history.slice(2);
      // If no more stops, disable the back button
      if( self._history.length == 0 )
        mapFooterView.disableBackButton();
      f[0].apply( self, f.slice(1) );
    };
    
    var hasViews = function () {
      return _.flatten(self.layout.views).length > 0;
    };
    
    this.findPortletHeight = function () {
      var siblingsHeight= 0,
          $siblings= $(this.options.target).siblings().not('script').not('style');
      _.each( $siblings, function (s) {
        siblingsHeight += $(s).outerHeight();
      });
      this.portletTop= siblingsHeight;
      this.layout.$el.find('.map-fullscreen').css('top', siblingsHeight + 'px');
    };
    
    // BIND FindPortletHeight TO WINDOW RESIZE
    $(window).bind('throttledresize', function () { self.findPortletHeight(); });
    
    
    
    /* VIEWS */
    /* home()
     * Check if doViews() has been run, add view to history, show mapSearch and mapView, set bottom nav to 'search'
     */
    this.home = function () {
      var controlsHeight;
      if( ! hasViews() ) this.doViews();
      addHistory(this.home);
      mapSearchFormView.setTitle('');
      
      showOnly([mapSearchFormView,mapView]);
      mapFooterView.setNav('search');
      mapFooterView
        //.bindNavTo('map', this.home, this)
        .enableMapButton();

      mapSearchFormView
        .hideControl('title')
        .showControl('search');
      controlsHeight= mapSearchFormView.getHeight();
      mapView.setTop( this.portletTop + controlsHeight );

    };
    
    /* searchResults()
     * 
     */
    this.searchResults = function (q) {
      reloadSearchResults = function () { this.searchResults(q); };
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', reloadSearchResults, this);
        return;
      }
      mapLocations.off('reset', reloadSearchResults);
      addHistory(this.searchResults, q);
      mapSearchResultsView.setSearchQuery(q);
      
      showOnly([mapSearchFormView,mapSearchResultsView]);
      mapFooterView.setNav('search');
      mapSearchFormView.search(q);
      mapSearchResultsView.render();
      mapFooterView
        .bindNavTo('map', function () { this.searchResultsMap(q) }, this)
        .enableMapButton();
      
      // TODO: how to get search field to show again?
      mapSearchFormView.showControl('search').showControl('title');
      mapSearchFormView.setTitle(q);
      
    };
    
    /* searchResultsMap()
     * 
     */
    this.searchResultsMap = function (q) {
      var controlsHeight;
      reloadSearchResultsMap= function () { this.searchResultsMap(q); };
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', reloadSearchResultsMap, this);
        return;
      }
      mapLocations.off('reset', reloadSearchResultsMap);
      addHistory(this.searchResultsMap, q);
      mapSearchFormView.setQuery(q).setTitle(q);
      showOnly([mapSearchFormView,mapView]);
      mapFooterView.setNav('map');
      mapSearchFormView.search(q);
      mapView.drawMap();

      mapFooterView.bindNavTo('search', function () { this.searchResults(q) }, this);

      mapSearchFormView
        .showControl('search')
        .showControl('title');
      controlsHeight= mapSearchFormView.getHeight();
      mapView.setTop( this.portletTop + controlsHeight );
    };

    /* locationDetail()
     *
     */
    this.locationDetail = function (id) {
      var location, reloadLocationDetail= function () { this.locationDetail(id); };
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', reloadLocationDetail, this);
        return;
      }
      mapLocations.off('reset', reloadLocationDetail);
      addHistory(this.locationDetail, id);
      location= mapLocations.findById(id);
      mapLocationDetailView.model.set( location.toJSON() );
      showOnly([mapLocationDetailView]);
      if( location.get('latitude') != null && location.get('longitude') != null ) {
        mapFooterView
          .bindNavTo('map', function () { this.locationMap(id); }, this)
          .enableMapButton();
      } else {
        mapFooterView
          .disableMapButton();
      }
    };

    /* locationMap()
     *
     */
    this.locationMap = function (id) {
      var location, controlsHeight, reloadLocationMap= function () { this.locationMap(id); };
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', reloadLocationMap, this);
        return;
      }
      mapLocations.off('reset', reloadLocationMap);
      addHistory(this.locationMap, id);
      location= mapLocations.findById(id);
      mapLocationDetailView.model.set( location.toJSON() );
      showOnly([mapSearchFormView,mapView]);
      matchingMapLocations.reset([location]);
      mapView.drawMap();
      mapFooterView.setNav('map');
      
      mapSearchFormView
        .hideControl('search')
        .showControl('title');
      controlsHeight= mapSearchFormView.getHeight();
      mapView.setTop( this.portletTop + controlsHeight );
    };

    /* categories()
     *
     */
    this.categories = function () {
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', this.categories, this);
        return;
      }
      mapLocations.off('reset', this.categories);
      addHistory(this.categories);
      showOnly([mapCategoriesView]);
      mapFooterView
        .setNav('browse')
        // TODO: should this be disabled, or go to search results map?
        .disableMapButton();
    };

    /* category()
     *
     */
    this.category = function (categoryName) {
      reloadCategory= function () { this.category(categoryName); };
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', reloadCategory, this);
        return;
      }
      mapLocations.off('reset', reloadCategory);
      addHistory(this.category, categoryName);
      mapFooterView.setNav('browse');
      mapCategoryDetailView.setCategoryName(categoryName);
      mapCategoryDetailView.render();
  
      showOnly([mapCategoryDetailView]);
      mapFooterView
        .bindNavTo('map', function () { this.categoryMap(categoryName) }, this)
        .enableMapButton();
    };
    
    /* categoryMap()
     * Display locations within a category on the map.
     */
    this.categoryMap = function (categoryName) {
      var matches, controlsHeight;
      reloadCategoryMap= function () { this.category(category) };
      if( ! hasViews() ) {
        this.doViews();
        mapLocations.on('reset', reloadCategoryMap, this);
        return;
      }
      mapLocations.off('reset', reloadCategoryMap);
      addHistory(this.categoryMap, categoryName);
      mapSearchFormView.setTitle(categoryName);
      mapFooterView.setNav('map');
      
      // Find all locations within a category
      matches= mapLocations.findByCategory(categoryName);
      matchingMapLocations.reset(matches);
      showOnly([mapSearchFormView,mapView]);
      mapView.drawMap();

      mapSearchFormView
        .hideControl('search')
        .showControl('title');
      controlsHeight= mapSearchFormView.getHeight();
      mapView.setTop( this.portletTop + controlsHeight );
    };
  
    /* doViews()
     * Defines views and listeners for portlet. Should only be run once.
     */
  
    this.doViews = function () {
      // collections
      mapLocations= new MapLocations({url:this.options.data});
      matchingMapLocations= new MatchingMapLocations();
      // views
      mapSearchFormView= new MapSearchFormView({
        mapLocations : mapLocations,
        matchingMapLocations : matchingMapLocations
      });
      mapSearchResultsView= new MapSearchResultsView({
        matchingMapLocations : matchingMapLocations
      });
      mapView= new MapView({
        mapLocations : mapLocations,
        matchingMapLocations : matchingMapLocations,
        mapOptions : this.options.mapOptions
      });
      mapLocationDetailView= new MapLocationDetailView({
        matchingMapLocations : matchingMapLocations
      });
      mapCategoriesView= new MapCategoriesView({
        mapLocations : mapLocations
      });
      mapCategoryDetailView= new MapCategoryDetailView({
        mapLocations : mapLocations,
        matchingMapLocations : matchingMapLocations
      });
      mapFooterView= new MapFooterView();
  
      this.layout.setViews( {
        '#map-search-form' : mapSearchFormView,
        '#map-search-results' : mapSearchResultsView,
        '#map-container' : mapView,
        '#map-location-detail' : mapLocationDetailView,
        '#map-categories' : mapCategoriesView,
        '#map-category-detail' : mapCategoryDetailView,
        '#map-footer' : mapFooterView
      });
      // Hide all views
      showOnly([]);
      this.layout.render();
  
      /* LISTENERS */
      mapSearchResultsView
        .on('clickResult', function (id) {
          this.locationDetail(id);
        }, this);
      mapView
        .on('clickLocation', function (id) {
          this.locationDetail( id );
        }, this);
  
      mapLocationDetailView
        .on('clickViewInMap', function (id) {
          this.locationMap(id);
        }, this);
  
      mapSearchFormView
        .on('submitSearch', function (query) {
          this.searchResults(query);
        }, this);
  
      mapCategoriesView
        .on('clickCategory', function (category) {
          this.category(category);
        }, this);
  
      mapCategoryDetailView
        .on('clickLocation', function (id) {
          this.locationDetail( id );
        }, this);

      mapFooterView
        .bindNavTo('back', function () {
          goBack();
        }, this)
        .bindNavTo('search', function () {
          this.home();
        }, this)
        .bindNavTo('browse', function () {
          this.categories();
        }, this)
        .bindNavTo('map', function () {
          this.home();
        }, this);
      /* / LISTENERS */
  
    };
  
   };
  
  /* Change underscore template syntax to work well with JSP. Default is <% %>.
   * The new syntax is "{!  !}" for scripts and "{{ }}" for expressions. So:
   * {! var myVar=42; !}
   * {{ myVar }}
   */
  _.templateSettings = {
    interpolate : /\{\{(.+?)\}\}/g,
    evaluate : /\{!(.+?)!\}/g
  };

  /* Create instance of router and start at home() */
  var router = new MapPortletRouter();
  router.layout=  new Backbone.LayoutManager({ template: options.template });
  router.options= options;
  $(document).ready(function () {
    $(options.target).html(router.layout.el);
    router.home();
  });
  
}

