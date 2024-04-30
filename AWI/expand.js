<script>
var arrState=[];

(function() {
 var arrAnswerBlocks=document.getElementsByClassName('answer');
 
 for (var i=0;i<arrAnswerBlocks.length;i++) {
 var element = arrAnswerBlocks[i];
 var state = {id:(element.id), collapsed:true};
 arrState.push(state);
 }
 
 })();

function expand(id) {
    var state={};
    var answerBlock=document.getElementById(id);
    
    for (var n=0;n<arrState.length;n++) {
        state=arrState[n];
        
        if (state.id==id) {
            if (state.collapsed) {
                answerBlock.style.display="block";
                state.collapsed=false; }
            else {
                answerBlock.style.display="none";
                state.collapsed=true;
            } //end if
        }//end if
        
    }// end for
}
</script>