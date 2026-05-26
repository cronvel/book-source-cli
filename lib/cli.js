/*
	Book Source CLI

	Copyright (c) 2023 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/
"use strict" ;



const bookSource = require( 'book-source' ) ;

const fs = require( 'fs' ) ;
const path = require( 'path' ) ;

const kungFig = require( 'kung-fig' ) ;

const term = require( 'terminal-kit' ).terminal ;
const cliManager = require( 'utterminal' ).cli ;



function cli() {
	var availableRenderers = Object.keys( renderers ) ;

	/* eslint-disable indent */
	var args = cliManager.package( require( '../package.json' ) )
		.app( 'Book Source CLI' )
		.description( "Book Source Command Line Interface." )
		//.introIfTTY
		.noIntro
		.helpOption
		.camel
		.arg( 'source' ).string
			.required
			.typeLabel( '.bks or .kfg or .json' )
			.description( "the source file, either a Book Source file or a KFG file containing all the sources and the renderer parameters." )
		.opt( [ 'output' , 'o' ] ).string
			.typeLabel( 'output-file' )
			.description( "The output file, if not present: output to stdout." )
		.opt( [ 'format' , 'f' ] ).string
			.typeLabel( 'format' )
			.description( "The output format, default to 'html'. Available formats are: " + availableRenderers.join( ', ' ) + "." )
			.default( 'html' )
		.opt( [ 'text-post-filter' , 't' ] ).arrayOf.string
			.typeLabel( 'filter' )
			.description( "One or multiple text post filters to apply. Available filters are: " + Object.keys( bookSource.textPostFilters ).join( ', ' ) + "." )
		.opt( [ 'post-process' , 'pp' ] ).object
			.typeLabel( 'object' )
			.description( "An object configuring post-processes, e.g. '--post-process.toc' or '--post-process.toc.max-level 2'. Available post-processes are: " + Object.keys( bookSource.postProcesses ).join( ', ' ) + "." )
		.opt( [ 'fragment' , 'F' ] ).flag
			.description( "Output a fragment, i.e. turn standalone off. Only affect renderers having a standalone mode." )
		.opt( [ 'toc-render' , 'T' ] ).flag
			.description( "Render only the Table of Contents, not the document." )
		.opt( [ 'simple-toc' , 'st' ] ).flag
			.description( "Display the simplified Table of Contents, not the document (only works for JSON or KFG output)." )
		.opt( [ 'container' ] , true ).flag
			.description( "Output the document in a container or not. Only affect some renderers like HTML (it will not create a container div)." )
		.run() ;
	/* eslint-enable indent */

	//console.error( args ) ;

	var package_ , baseDir ,
		rawContent = '' ,
		isPackage = false ,
		cwd = process.cwd() + '/' ,
		extension = path.extname( args.source ).slice( 1 ) ;

	switch ( extension ) {
		case 'bks' :
			baseDir = cwd ;
			package_ = {
				sources: [ args.source ]
			} ;
			break ;

		case 'kfg' :
			isPackage = true ;
			if ( path.isAbsolute( args.source ) ) {
				baseDir = path.dirname( args.source ) + '/' ;
				package_ = kungFig.load( args.source ) ;
			}
			else {
				baseDir = path.dirname( cwd + args.source ) + '/' ;
				package_ = kungFig.load( cwd + args.source ) ;
			}
			break ;

		case 'json' :
			isPackage = true ;
			if ( path.isAbsolute( args.source ) ) {
				baseDir = path.dirname( args.source ) + '/' ;
				package_ = require( args.source ) ;
			}
			else {
				baseDir = path.dirname( cwd + args.source ) + '/' ;
				package_ = require( cwd + args.source ) ;
			}
			break ;

		default :
			if ( extension ) { term.red( "Cannot load file with extension '.%s'.\n" , extension ) ; }
			else { term.red( "Cannot load file without extension.\n" ) ; }
			cliManager.displayHelp() ;
			process.exit( 1 ) ;
	}

	package_.simpleToc = args.simpleToc ;
	package_.tocRender = args.tocRender ;
	package_.standalone = ! args.fragment ;
	package_.noContainer = ! args.container ;
	args.format = args.format.toLowerCase() ;

	if ( ! availableRenderers.includes( args.format ) ) {
		term.red( "Unsupported format '%s'.\n" , args.format ) ;
		cliManager.displayHelp() ;
		process.exit( 1 ) ;
	}


	if ( ! Array.isArray( package_.sources ) || ! package_.sources.length ) {
		term.red( "No source specified in the package.\n" ) ;
		process.exit( 1 ) ;
	}


	for ( let sourcePath of package_.sources ) {
		let sourceContent ,
			fullPath = sourcePath ;

		if ( ! path.isAbsolute( fullPath ) ) { fullPath = path.join( baseDir , fullPath ) ; }
		if ( ! path.extname( fullPath ) ) { fullPath += '.bks' ; }

		try {
			sourceContent = fs.readFileSync( fullPath , 'utf8' ) ;
		}
		catch ( error ) {
			term.red( "Error reading source file '%s': %E\n" , sourcePath , error ) ;
			process.exit( 1 ) ;
		}

		if ( rawContent ) { rawContent += '\n' ; }
		rawContent += sourceContent ;
	}

	var structuredDocument = bookSource.parse( rawContent , {
		metadataParser: kungFig.parse
	} ) ;


	// Text post-filters
	var textPostFilters = [] ;
	// Add package text post-filters first, then command line text post-filters
	if ( Array.isArray( package_.textPostFilters ) ) { textPostFilters.push( ... package_.textPostFilters ) ; }
	if ( Array.isArray( args.textPostFilter ) ) { textPostFilters.push( ... args.textPostFilter ) ; }
	if ( textPostFilters.length ) { structuredDocument.textPostFilter( textPostFilters ) ; }

	// Post-process
	var postProcess = {} ;
	// Add package post-process first, then command line post-process
	if ( package_.postProcess && typeof package_.postProcess === 'object' ) { Object.assign( postProcess , package_.postProcess ) ; }
	if ( args.postProcess && typeof args.postProcess === 'object' ) { Object.assign( postProcess , args.postProcess ) ; }
	if ( Object.keys( postProcess ).length ) { structuredDocument.postProcess( postProcess ) ; }

	// Theme
	var theme = package_.theme || structuredDocument.theme ;
	theme = ! theme || typeof theme !== 'object' ? new bookSource.Theme() : new bookSource.Theme( theme ) ;

	var output = renderers[ args.format ]( structuredDocument , theme , package_ ) ;

	if ( ! args.output ) {
		console.log( output ) ;
		return ;
	}

	try {
		fs.writeFileSync( args.output , output , 'utf8' ) ;
	}
	catch ( error ) {
		term.red( "Error writing destination file '%s': %E\n" , args.output , error ) ;
		process.exit( 1 ) ;
	}
}

module.exports = cli ;



const renderers = {} ;



renderers.html = ( structuredDocument , theme , package_ ) => {
	const HtmlRenderer = require( 'book-source-html-renderer' ) ;
	const highlight = require( 'highlight.js' ) ;

	var specialRender = package_.tocRender ? 'toc' : null ;

	if ( ! package_.css ) { package_.css = {} ; }
	else if ( typeof package_.css === 'string' ) { package_.css = { core: package_.css } ; }

	// Load CSS files
	var standaloneCss =
		package_.css.standalone ? fs.readFileSync( package_.css.standalone , 'utf8' ) :
		HtmlRenderer.getBuiltinCssSync( 'standalone' ) ;

	var coreCss =
		package_.css.core ? fs.readFileSync( package_.css.core , 'utf8' ) :
		HtmlRenderer.getBuiltinCssSync( 'core' ) ;

	var codeCss =
		package_.css.code ? fs.readFileSync( package_.css.code , 'utf8' ) :
		HtmlRenderer.getBuiltinCssSync( 'code' ) ;

	var htmlRenderer = new HtmlRenderer(
		theme ,
		{
			standalone: package_.standalone ,
			noContainer: package_.noContainer ,
			standaloneCss ,
			coreCss ,
			codeCss ,
			idAttribute: true ,
			codeHighlighter: ( text , lang ) => highlight.highlight( text , { language: lang } ).value
		}
	) ;

	return structuredDocument.render( htmlRenderer , specialRender ) ;
} ;



// Mainly for debugging purpose
renderers.json = ( structuredDocument , theme , package_ ) => {
	let baseObject =
		package_.simpleToc ? structuredDocument.toc :
		package_.tocRender ? structuredDocument.tocList :
		structuredDocument ;

	return JSON.stringify( baseObject , null , "  " ) ;
} ;



// Mainly for debugging purpose
renderers.kfg = ( structuredDocument , theme , package_ ) => {
	let baseObject =
		package_.simpleToc ? structuredDocument.toc :
		package_.tocRender ? structuredDocument.tocList :
		structuredDocument ;

	return kungFig.stringify( baseObject ) ;
} ;



// Mainly for debugging purpose
renderers.inspect = ( structuredDocument , theme , package_ ) => {
	const inspect = require( 'string-kit/lib/inspect.js' ).inspect ;
	const inspectOptions = { style: 'color' , depth: 20 , outputMaxLength: 1000000 } ;

	return inspect( inspectOptions , structuredDocument ) ;
} ;

